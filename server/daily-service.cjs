/* Server-authoritative daily competition. All paths stay within flipsideDaily/v1. */
const { createHmac, createHash } = require('node:crypto');
const { MemoryGame, createDeck, CARD_THEMES } = require('../engine.js');
const { utcDay, dayNumber, nextReset, streakFor, rewardFor } = require('../daily-rules.js');
const ROOT = 'flipsideDaily/v1';
const MAX_BOARD = 50;
const RANKED_LEVEL = 'medium';
class DailyError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
function seededRandom(seed) {
  let cursor = 0, bytes = Buffer.alloc(0), offset = 0;
  return () => {
    if (offset >= bytes.length) { bytes = createHash('sha256').update(`${seed}:${cursor++}`).digest(); offset = 0; }
    const n = bytes.readUInt32BE(offset); offset += 4; return n / 4294967296;
  };
}
function makePuzzle(date, secret) {
  if (dayNumber(date) === null || typeof secret !== 'string' || secret.length < 32) throw new Error('Daily seed configuration unavailable');
  const seed = createHmac('sha256', secret).update(`flipside-daily-v1:${date}`).digest('hex');
  const themes = Object.keys(CARD_THEMES);
  const theme = themes[((dayNumber(date) % themes.length) + themes.length) % themes.length];
  return { version: 1, date, level: RANKED_LEVEL, theme, cards: createDeck(RANKED_LEVEL, seededRandom(seed), theme) };
}
const playerName = uid => {
  const names = ['Fox', 'Panda', 'Owl', 'Whale', 'Koala', 'Frog'];
  const hash = createHash('sha256').update(`flipside-player:${uid}`).digest('hex');
  return `Curious ${names[parseInt(hash.slice(0, 2), 16) % names.length]} ${hash.slice(2, 6).toUpperCase()}`;
};
const rankKey = (moves, time, completedAt, uid) => `${String(moves).padStart(8, '0')}:${String(Math.floor(time)).padStart(12, '0')}:${String(completedAt).padStart(14, '0')}:${createHash('sha256').update(uid).digest('hex').slice(0, 16)}`;
function profileView(profile, uid, today) {
  const p = profile || { days: [], credits: 0, longest: 0, completions: 0 };
  const streak = streakFor(p.days, today);
  return { player: playerName(uid), streak, longest: p.longest, credits: p.credits,
    completions: p.completions, completedDays: p.days.slice(-35), rewardToday: rewardFor(streakFor([...p.days, today], today)),
    claimedToday: p.days.includes(today) };
}
function publicResult(entry) {
  if (!entry) return null;
  return { player: entry.player, date: entry.date, moves: entry.moves, time: entry.time,
    accuracy: entry.accuracy, completedAt: entry.completedAt, credits: entry.credits, streak: entry.streak };
}
function currentGame(attempt) {
  return Object.assign(new MemoryGame(), attempt.game);
}
function settle(game, attempt, now) {
  if (game.effect === 'mismatch' && now >= attempt.lockUntil) game.resolveMismatch();
}
function roundView(attempt, now) {
  if (!attempt) return null;
  const game = currentGame(attempt); settle(game, attempt, now);
  const open = game.open;
  return { date: attempt.date, version: attempt.version, status: game.status, level: game.level, theme: game.theme,
    cards: game.cards.map((c, index) => ({ index, matched: c.matched, ...(c.matched || open.includes(index) ? { key: c.key, name: c.name, emoji: c.emoji, ...(c.art ? { art: c.art } : {}) } : {}) })),
    open: [...open], moves: game.moves, matches: game.matches, started: game.startedAt !== null,
    elapsed: game.elapsed(now), lockRemaining: game.effect === 'mismatch' ? Math.max(0, attempt.lockUntil - now) : 0,
    expiresAt: nextReset(attempt.date), result: publicResult(attempt.result) };
}
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DailyError('invalid-input', 'A JSON action is required.', 400);
  const keys = { overview: ['action', 'date'], state: ['action', 'date'], start: ['action', 'date', 'requestId'], flip: ['action', 'date', 'requestId', 'index', 'expectedVersion'] };
  if (!Object.hasOwn(keys, body.action) || Object.keys(body).some(key => !keys[body.action].includes(key))) throw new DailyError('invalid-input', 'Unknown action or fields.', 400);
  if (body.date !== undefined && dayNumber(body.date) === null) throw new DailyError('invalid-date', 'Use a valid UTC date.', 400);
  if (['start', 'flip'].includes(body.action) && (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(body.requestId))) throw new DailyError('invalid-id', 'An action ID is required.', 400);
  if (body.action === 'flip' && (!Number.isInteger(body.index) || body.index < 0 || body.index >= 20 || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 0)) throw new DailyError('invalid-flip', 'Invalid card or version.', 400);
}
function createDailyService({ store, secret, now = Date.now }) {
  async function execute(uid, body) {
    validate(body);
    if (typeof uid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw new DailyError('auth-required', 'Sign in to play.', 401);
    const time = now(), today = utcDay(time), date = body.date || today;
    if (dayNumber(date) > dayNumber(today) || dayNumber(today) - dayNumber(date) > 30) throw new DailyError('invalid-date', 'That challenge is not available.', 400);
    if (['start', 'flip'].includes(body.action) && date !== today) throw new DailyError('expired', 'This UTC challenge has ended. A new puzzle is ready.');
    const paths = { puzzle: `${ROOT}/days/${date}`, attempt: `${ROOT}/days/${date}/attempts/${uid}`, profile: `${ROOT}/players/${uid}`, rate: `${ROOT}/rates/${uid}`, entry: `${ROOT}/days/${date}/entries/${uid}` };
    const response = await store.transaction(async tx => {
      const [savedPuzzle, savedAttempt, savedProfile, rate, entry] = await tx.getAll(Object.values(paths));
      const bucket = Math.floor(time / 10000);
      const requests = rate?.bucket === bucket ? rate.requests + 1 : 1;
      if (requests > 45) throw new DailyError('rate-limit', 'A little slower, please. Try again in a moment.', 429);
      tx.set(paths.rate, { bucket, requests, updatedAt: time });
      let puzzle = savedPuzzle;
      if (!puzzle && date === today) { puzzle = makePuzzle(date, secret); tx.set(paths.puzzle, puzzle); }
      let attempt = savedAttempt;
      if (['start', 'flip'].includes(body.action) && attempt?.lastActions?.includes(body.requestId)) {
        return { round: roundView(attempt, time), profile: profileView(savedProfile, uid, today), event: 'duplicate' };
      }
      if (body.action === 'start') {
        if (!attempt) {
          const game = new MemoryGame(); game.start(RANKED_LEVEL, () => .5, puzzle.theme);
          game.cards = structuredClone(puzzle.cards);
          attempt = { date, version: 0, game: JSON.parse(JSON.stringify(game)), lockUntil: 0, lastActions: [body.requestId], result: null, createdAt: time };
          tx.set(paths.attempt, attempt);
        }
        return { round: roundView(attempt, time), profile: profileView(savedProfile, uid, today), event: 'start' };
      }
      if (body.action === 'flip') {
        if (!attempt) throw new DailyError('not-started', 'Start today’s challenge first.');
        if (body.expectedVersion !== attempt.version) throw new DailyError('stale', 'Another tab changed this round. Refresh your daily board.');
        const game = currentGame(attempt); settle(game, attempt, time);
        if (game.status === 'won') return { round: roundView(attempt, time), profile: profileView(savedProfile, uid, today), event: 'finished' };
        if (game.locked) throw new DailyError('wait', 'Let the unmatched cards turn back first.');
        const event = game.flip(body.index, time);
        if (event.type === 'ignored') throw new DailyError('invalid-turn', 'That card is already open or matched.');
        attempt.version++;
        attempt.lockUntil = event.type === 'mismatch' ? time + 1000 : 0;
        attempt.lastActions = [...(attempt.lastActions || []), body.requestId].slice(-32);
        attempt.game = JSON.parse(JSON.stringify(game));
        let profile = savedProfile;
        if (event.type === 'win') {
          profile ||= { days: [], credits: 0, longest: 0, completions: 0 };
          // The completion and reward share this transaction. Retries cannot credit twice.
          if (!entry && !profile.days.includes(date)) {
            const days = [...new Set([...profile.days, date])].sort().slice(-3660);
            const streak = streakFor(days, date), credits = rewardFor(streak);
            profile = { days, credits: profile.credits + credits, longest: Math.max(profile.longest, streak), completions: profile.completions + 1 };
            attempt.result = { date, player: playerName(uid), moves: game.moves, time: game.elapsed(time), accuracy: 100 * game.matches / game.moves,
              completedAt: time, credits, streak };
            tx.set(paths.profile, profile);
            tx.set(paths.entry, { ...attempt.result, rankKey: rankKey(game.moves, game.elapsed(time), time, uid) });
          } else attempt.result = entry || attempt.result;
        }
        tx.set(paths.attempt, attempt);
        return { round: roundView(attempt, time), profile: profileView(profile, uid, today), event: event.type };
      }
      return { challenge: puzzle ? { date, level: puzzle.level, theme: puzzle.theme, pairs: 10, rows: 4, columns: 5, expiresAt: nextReset(date) } : null,
        round: roundView(attempt, time), profile: profileView(savedProfile, uid, today), ownResult: publicResult(entry) };
    });
    if (body.action === 'overview') {
      const entries = await store.leaderboard(`${ROOT}/days/${date}/entries`, MAX_BOARD);
      const ownSuffix = `:${createHash('sha256').update(uid).digest('hex').slice(0, 16)}`;
      response.leaderboard = entries.map(entry => ({ ...publicResult(entry), isYou: entry.rankKey.endsWith(ownSuffix) }));
      response.ownRank = response.ownResult ? await store.rank(`${ROOT}/days/${date}/entries`, rankKey(response.ownResult.moves, response.ownResult.time, response.ownResult.completedAt, uid)) : null;
    }
    return { ...response, serverNow: time, today, date };
  }
  return { execute };
}
module.exports = { ROOT, MAX_BOARD, DailyError, seededRandom, makePuzzle, playerName, rankKey, publicResult, roundView, validate, createDailyService };
