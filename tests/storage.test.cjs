const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryGame, calculatePerformance } = require('../engine.js');
const { SafeStore, normalizeRecord, normalizeLeaderboard, compareRecords, addResult, makeResult } = require('../storage.js');
const result = (id, options = {}) => {
  const r = { id, level: 'easy', theme: 'fruits', time: 20000, moves: 12, hintsUsed: 0, shufflesUsed: 0, completedAt: 1000000, ...options };
  const pairs = { easy: 8, medium: 10, hard: 18 }[r.level];
  r.score = calculatePerformance(r.level, pairs, r.moves, r.time, true).totalScore;
  return r;
};

test('leaderboard ranks by score, then exact time, then moves, without duplicate run IDs', () => {
  const records = [result('run-0001', { time: 20900, moves: 12 }), result('run-0002', { time: 20100, moves: 13 }),
    result('run-0003', { time: 20100, moves: 11 }), result('run-0004', { time: 19000 })];
  const ranked = normalizeLeaderboard({ version: 1, records: [...records, records[0]] });
  assert.deepEqual(ranked.map(r => r.id), ['run-0004', 'run-0003', 'run-0002', 'run-0001']);
  assert.equal(addResult(ranked, records[0]).length, 4);
  assert.ok(ranked.every((r, i) => !i || compareRecords(ranked[i - 1], r) <= 0));
});

test('top ten are retained independently for each difficulty', () => {
  let records = [];
  for (const level of ['easy', 'medium', 'hard']) {
    for (let i = 0; i < 15; i++) records = addResult(records, result(`${level}-run-${String(i).padStart(3, '0')}`, { level, moves: 30, time: i * 1000 }));
  }
  assert.equal(records.length, 30);
  for (const level of ['easy', 'medium', 'hard']) {
    const saved = records.filter(r => r.level === level);
    assert.equal(saved.length, 10);
    assert.equal(saved[0].time, 0);
    assert.equal(saved[9].time, 9000);
  }
});

test('stars, accuracy, assistance, and final scores are derived, not trusted from local data', () => {
  const record = normalizeRecord({ ...result('run-valid', { moves: 16, hintsUsed: 1 }), accuracy: 999, stars: 99, assisted: false });
  assert.equal(record.accuracy, 50);
  assert.equal(record.stars, 2);
  assert.equal(record.assisted, true);
  assert.equal(record.score, 1000);
  assert.equal(normalizeRecord({ ...result('run-invalid'), score: 999999 }), null);
});

test('invalid stored scores are ignored without breaking valid records', () => {
  const valid = result('run-valid');
  const invalid = [null, {}, { ...valid, id: '<script>' }, { ...valid, level: 'constructor' }, { ...valid, theme: '__proto__' },
    { ...valid, moves: 3 }, { ...valid, moves: Infinity }, { ...valid, time: -1 }, { ...valid, hintsUsed: 4 },
    { ...valid, shufflesUsed: 3 }, { ...valid, completedAt: NaN }];
  assert.equal(normalizeLeaderboard({ version: 1, records: [valid, ...invalid] }).length, 1);
  for (const value of [null, [], 'bad', { version: 2, records: [valid] }]) assert.deepEqual(normalizeLeaderboard(value), []);
});

test('only finished games create leaderboard records and paused time is excluded', () => {
  const game = new MemoryGame();
  game.start('easy');
  assert.equal(makeResult(game), null);
  game.useHint(1000); game.resolveHint();
  game.pause(2000); game.resume(12000);
  for (let pair = 0; pair < 8; pair++) {
    for (const i of game.cards.flatMap((c, i) => c.pair === pair ? [i] : [])) game.flip(i, 13000 + pair * 1000);
  }
  const record = makeResult(game, 500000);
  assert.equal(record.time, 9000);
  assert.equal(record.assisted, true);
  assert.equal(record.hintsUsed, 1);
  assert.equal(record.score, game.score);
  assert.equal(record.completedAt, 500000);
  assert.equal(game.snapshot(), null);
});

test('storage failures preserve an in-memory fallback and report that saving is unavailable', () => {
  const failing = new SafeStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } });
  assert.equal(failing.load('empty', 42), 42);
  assert.equal(failing.save('progress', { moves: 3 }), false);
  assert.deepEqual(failing.load('progress'), { moves: 3 });
  assert.equal(failing.available, false);
  failing.remove('progress');
  assert.equal(failing.load('progress'), null);
});

test('quota failures never replace newer in-memory scores with stale readable disk data', () => {
  let writable = false;
  let raw = '{"score":100}';
  const store = new SafeStore({ getItem: () => raw, setItem: (key, value) => { if (!writable) throw new Error('Quota'); raw = value; }, removeItem: () => { throw new Error('Blocked'); } });
  assert.deepEqual(store.load('best'), { score: 100 });
  store.save('best', { score: 200 });
  assert.deepEqual(store.load('best'), { score: 200 });
  writable = true;
  assert.equal(store.save('best', { score: 300 }), true);
  assert.deepEqual(store.load('best'), { score: 300 });
  store.remove('best');
  assert.equal(store.load('best'), null);
});

test('valid storage serializes JSON and malformed JSON falls back safely', () => {
  const data = new Map();
  const store = new SafeStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) });
  assert.equal(store.save('key', { score: 123 }), true);
  assert.equal(data.get('key'), '{"score":123}');
  assert.deepEqual(store.load('key'), { score: 123 });
  data.set('broken', 'not json');
  assert.equal(store.load('broken', 'fallback'), 'fallback');
  store.remove('key');
  assert.equal(store.load('key'), null);
});
