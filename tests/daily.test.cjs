const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MemoryStore } = require('./daily-store.cjs');
const { utcDay, nextReset, dayNumber, streakFor, rewardFor } = require('../daily-rules.js');
const { createDailyService, makePuzzle, rankKey, ROOT } = require('../server/daily-service.cjs');
const { checkPath } = require('../server/cloud.cjs');
const SECRET = 'unit-test-only-seed-never-used-in-production-123456';
function fixture(initial = '2026-11-17T12:00:00Z') {
  const store = new MemoryStore(); let clock = Date.parse(initial);
  const service = createDailyService({ store, secret: SECRET, now: () => clock });
  return { store, service, now: () => clock, advance: ms => clock += ms, set: date => clock = Date.parse(date),
    request: (uid, action, fields = {}) => service.execute(uid, { action, ...fields, ...(['flip', 'start'].includes(action) && !fields.requestId ? { requestId: randomUUID() } : {}) }) };
}
async function finish(f, uid, options = {}) {
  let response = await f.request(uid, 'start');
  const privateAttempt = f.store.docs.get(`${ROOT}/days/${response.date}/attempts/${uid}`);
  const pairs = new Map(); privateAttempt.game.cards.forEach((c, i) => pairs.set(c.pair, [...(pairs.get(c.pair) || []), i]));
  if (options.mismatch) {
    const a = privateAttempt.game.cards[0], b = privateAttempt.game.cards.findIndex(c => c.pair !== a.pair);
    response = await f.request(uid, 'flip', { index: 0, expectedVersion: response.round.version }); f.advance(300);
    response = await f.request(uid, 'flip', { index: b, expectedVersion: response.round.version }); f.advance(1100);
  }
  for (const pair of pairs.values()) {
    for (const index of pair) {
      f.advance(options.step || 300);
      response = await f.request(uid, 'flip', { index, expectedVersion: response.round.version });
    }
  }
  return response;
}

test('UTC days are validated across timezone boundaries and calendar edge cases', () => {
  assert.equal(utcDay(Date.parse('2026-01-01T01:00:00+05:30')), '2025-12-31');
  assert.equal(utcDay(nextReset('2026-12-31')), '2027-01-01');
  assert.equal(utcDay(nextReset('2028-02-28')), '2028-02-29');
  assert.equal(dayNumber('2026-02-30'), null);
  assert.equal(dayNumber('constructor'), null);
});

test('one secret/date yields one deterministic medium deck, different days yield new arrangements', () => {
  const keys = new Set();
  for (let d = 1; d <= 30; d++) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    const puzzle = makePuzzle(date, SECRET);
    assert.deepEqual(puzzle, makePuzzle(date, SECRET));
    assert.equal(puzzle.cards.length, 20);
    assert.equal(new Set(puzzle.cards.map(c => c.key)).size, 10);
    keys.add(puzzle.cards.map(c => c.key).join());
  }
  assert.equal(keys.size, 30);
});

test('overview and unopened rounds do not reveal seed, hidden picture keys, UID, or private board order', async () => {
  const f = fixture(); const uid = 'private-user-a';
  const overview = await f.request(uid, 'overview');
  assert.equal(overview.challenge.columns, 5);
  assert.equal(overview.leaderboard.length, 0);
  assert.equal(overview.profile.credits, 0);
  const start = await f.request(uid, 'start');
  assert.ok(start.round.cards.every(c => Object.keys(c).sort().join() === 'index,matched'));
  const text = JSON.stringify(start);
  assert.ok(!text.includes(uid) && !text.includes(SECRET));
  const first = await f.request(uid, 'flip', { index: 0, expectedVersion: 0 });
  assert.equal(first.round.cards.filter(c => c.key).length, 1);
  assert.equal(first.round.moves, 0);
});

test('players receive identical hidden arrangements with isolated attempts and progress', async () => {
  const f = fixture(); await Promise.all([f.request('alice', 'start'), f.request('bob', 'start')]);
  const date = utcDay(f.now());
  const a = f.store.docs.get(`${ROOT}/days/${date}/attempts/alice`), b = f.store.docs.get(`${ROOT}/days/${date}/attempts/bob`);
  assert.deepEqual(a.game.cards, b.game.cards);
  await f.request('alice', 'flip', { index: 0, expectedVersion: 0 });
  assert.equal((await f.request('bob', 'state')).round.open.length, 0);
});

test('reloading and starting again resumes the single ranked attempt without resetting moves or time', async () => {
  const f = fixture(); await f.request('alice', 'start');
  let r = await f.request('alice', 'flip', { index: 0, expectedVersion: 0 }); f.advance(5000);
  const resumed = await f.request('alice', 'start');
  assert.equal(resumed.round.version, 1); assert.deepEqual(resumed.round.open, [0]); assert.equal(resumed.round.elapsed, 5000);
  assert.equal(resumed.round.started, true);
});

test('simultaneous first flips use expected versions and apply exactly once', async () => {
  const f = fixture(); await f.request('alice', 'start');
  const results = await Promise.allSettled([0, 1].map(index => f.request('alice', 'flip', { index, expectedVersion: 0 })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'stale');
});

test('retrying the same action ID never spends another move or reveals another card', async () => {
  const f = fixture(); await f.request('alice', 'start'); const id = randomUUID();
  await f.request('alice', 'flip', { requestId: id, index: 0, expectedVersion: 0 });
  const duplicate = await f.request('alice', 'flip', { requestId: id, index: 0, expectedVersion: 0 });
  assert.equal(duplicate.event, 'duplicate'); assert.equal(duplicate.round.version, 1); assert.equal(duplicate.round.moves, 0);
});

test('matching counts one move; an unmatched pair locks until the server delay ends', async () => {
  const f = fixture(); await f.request('alice', 'start');
  const attempt = f.store.docs.get(`${ROOT}/days/${utcDay(f.now())}/attempts/alice`);
  const mismatch = attempt.game.cards.findIndex(c => c.pair !== attempt.game.cards[0].pair);
  await f.request('alice', 'flip', { index: 0, expectedVersion: 0 });
  const r = await f.request('alice', 'flip', { index: mismatch, expectedVersion: 1 });
  assert.equal(r.round.moves, 1); assert.equal(r.round.lockRemaining, 1000);
  await assert.rejects(f.request('alice', 'flip', { index: 2, expectedVersion: 2 }), e => e.code === 'wait');
  f.advance(1001);
  const view = await f.request('alice', 'state'); assert.equal(view.round.open.length, 0);
  const next = await f.request('alice', 'flip', { index: 0, expectedVersion: 2 }); assert.deepEqual(next.round.open, [0]);
});

test('ranked APIs reject client times, score submissions, forged identity fields, and practice power-ups', async () => {
  const f = fixture();
  for (const body of [{ action: 'finish', score: 99999 }, { action: 'pause' }, { action: 'hint' }, { action: 'shuffle' },
    { action: 'start', requestId: randomUUID(), uid: 'bob' }, { action: 'flip', requestId: randomUUID(), index: '0', expectedVersion: 0 },
    { action: 'flip', requestId: randomUUID(), index: 0, expectedVersion: 0, elapsed: 1 }]) {
    await assert.rejects(f.service.execute('alice', body), e => e.status === 400);
  }
});

test('daily completion atomically credits rewards, updates the streak, and publishes a public result', async () => {
  const f = fixture(); const won = await finish(f, 'alice');
  assert.equal(won.event, 'win'); assert.equal(won.round.moves, 10); assert.equal(won.profile.credits, 100); assert.equal(won.profile.streak, 1);
  assert.equal(won.round.result.credits, 100);
  const board = await f.request('bob', 'overview');
  assert.equal(board.leaderboard.length, 1); assert.equal(board.leaderboard[0].moves, 10);
  assert.equal(board.profile.credits, 0);
  assert.ok(!JSON.stringify(board).includes('alice'));
  const own = await f.request('alice', 'overview'); assert.equal(own.ownRank, 1);
});

test('completed daily attempts cannot earn a second reward via start, retry, refresh, or racing requests', async () => {
  const f = fixture(); await finish(f, 'alice');
  await Promise.all([f.request('alice', 'start'), f.request('alice', 'start'), f.request('alice', 'state')]);
  const state = await f.request('alice', 'overview');
  assert.equal(state.profile.credits, 100); assert.equal(state.profile.completions, 1); assert.equal(state.leaderboard.length, 1);
});

test('shared rankings prioritize minimum moves over speed, then time, and return a private own rank', async () => {
  const f = fixture(); const b = await finish(f, 'bob', { mismatch: true, step: 200 });
  f.advance(10000); const a = await finish(f, 'alice', { step: 700 });
  f.advance(10000); const c = await finish(f, 'charlie', { step: 400 });
  const view = await f.request('bob', 'overview');
  assert.deepEqual(view.leaderboard.map(r => r.moves), [10, 10, 11]);
  assert.equal(view.leaderboard[0].player, c.profile.player); assert.equal(view.ownRank, 3);
  assert.ok(b.round.result.time < a.round.result.time);
});

test('consecutive UTC completions earn one daily reward and accumulate an active/longest streak', async () => {
  const f = fixture();
  for (let day = 17; day <= 19; day++) {
    f.set(`2026-11-${day}T12:00:00Z`); const won = await finish(f, 'alice');
    assert.equal(won.profile.streak, day - 16); assert.equal(won.round.result.credits, 100 + (day - 17) * 10);
  }
  const profile = await f.request('alice', 'overview'); assert.equal(profile.profile.credits, 330); assert.equal(profile.profile.longest, 3);
  f.set('2026-11-20T12:00:00Z'); assert.equal((await f.request('alice', 'overview')).profile.streak, 3);
  f.set('2026-11-21T12:00:00Z'); assert.equal((await f.request('alice', 'overview')).profile.streak, 0);
  const reset = await finish(f, 'alice'); assert.equal(reset.profile.streak, 1); assert.equal(reset.profile.longest, 3); assert.equal(reset.profile.credits, 430);
});

test('a missed day, year boundary, leap day, and long reward streaks use real calendar dates', () => {
  assert.equal(streakFor(['2026-12-31', '2027-01-01'], '2027-01-01'), 2);
  assert.equal(streakFor(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01'), 3);
  assert.equal(streakFor(['2026-11-14', '2026-11-16'], '2026-11-17'), 1);
  assert.equal(streakFor(['2026-11-14'], '2026-11-17'), 0);
  assert.equal(rewardFor(7), 160); assert.equal(rewardFor(100), 160);
});

test('UTC rollover expires unfinished attempts, rejects future/past submissions, and starts a fresh day', async () => {
  const f = fixture('2026-11-17T23:59:58Z'); await f.request('alice', 'start');
  await f.request('alice', 'flip', { index: 0, expectedVersion: 0 }); f.advance(3000);
  await assert.rejects(f.request('alice', 'flip', { date: '2026-11-17', index: 1, expectedVersion: 1 }), e => e.code === 'expired');
  await assert.rejects(f.request('alice', 'start', { date: '2026-11-19' }), e => e.code === 'invalid-date');
  const fresh = await f.request('alice', 'start'); assert.equal(fresh.date, '2026-11-18'); assert.equal(fresh.round.moves, 0); assert.equal(fresh.profile.credits, 0);
});

test('past-day leaderboard reads are allowed without generating new archived puzzles', async () => {
  const f = fixture(); await finish(f, 'alice'); f.set('2026-11-18T12:00:00Z');
  const history = await f.request('bob', 'overview', { date: '2026-11-17' }); assert.equal(history.leaderboard.length, 1);
  const empty = await f.request('bob', 'overview', { date: '2026-11-16' }); assert.equal(empty.challenge, null);
  assert.ok(!f.store.docs.has(`${ROOT}/days/2026-11-16`));
});

test('validated per-player rate limits do not affect another player', async () => {
  const f = fixture();
  for (let i = 0; i < 45; i++) await f.request('alice', 'state');
  await assert.rejects(f.request('alice', 'state'), e => e.status === 429);
  await f.request('bob', 'state'); f.advance(10000); await f.request('alice', 'state');
});

test('namespace guard rejects every path outside FlipSide and rank keys sort by moves/time', () => {
  assert.doesNotThrow(() => checkPath(`${ROOT}/days/2026-11-17`));
  for (const path of ['pantrypal/v1/users/alice', 'noMercyArena/v1/rooms/one', 'flipsideDaily/v2/users/a']) assert.throws(() => checkPath(path));
  assert.ok(rankKey(10, 9000, 10000, 'a') < rankKey(11, 100, 10000, 'b'));
  assert.ok(rankKey(10, 8000, 10000, 'a') < rankKey(10, 9000, 10000, 'b'));
});
