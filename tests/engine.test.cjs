const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS, SYMBOLS, shuffle, createDeck, MemoryGame, formatTime } = require('../engine.js');

for (const [level, config] of Object.entries(LEVELS)) {
  test(`${level}: correct grid, unique IDs, and exactly two cards per pair`, () => {
    const deck = createDeck(level);
    assert.equal(deck.length, config.rows * config.columns);
    assert.equal(deck.length, config.pairs * 2);
    assert.equal(new Set(deck.map(c => c.id)).size, deck.length);
    const counts = new Map();
    deck.forEach(c => counts.set(c.pair, (counts.get(c.pair) || 0) + 1));
    assert.equal(counts.size, config.pairs);
    counts.forEach(count => assert.equal(count, 2));
    assert.ok(deck.every(c => !c.matched));
  });
  test(`${level}: full playthrough, score, moves, and frozen timer`, () => {
    const game = new MemoryGame();
    game.start(level);
    let now = 1000;
    for (let pair = 0; pair < config.pairs; pair++) {
      const indexes = game.cards.flatMap((card, index) => card.pair === pair ? [index] : []);
      assert.equal(game.flip(indexes[0], now).type, 'first');
      now += 500;
      assert.equal(game.flip(indexes[1], now).type, pair === config.pairs - 1 ? 'win' : 'match');
      now += 500;
    }
    assert.equal(game.status, 'won');
    assert.equal(game.moves, config.pairs);
    const bonus = Math.floor((config.targetSeconds * 1000 - (config.pairs * 1000 - 500)) / 1000) * 5;
    assert.equal(game.score, config.pairs * 100 + bonus);
    assert.equal(game.speedBonus, bonus);
    assert.equal(game.performance().accuracy, 100);
    assert.equal(game.performance().stars, 3);
    assert.equal(game.matches, config.pairs);
    assert.ok(game.cards.every(c => c.matched));
    assert.equal(game.elapsed(999999), config.pairs * 1000 - 500);
    assert.equal(game.flip(0).type, 'ignored');
  });
  test(`${level}: new game reshuffles positions and resets all statistics`, () => {
    const game = new MemoryGame();
    game.start(level, () => .1);
    const oldDeck = game.cards.map(c => c.id).join();
    game.flip(0, 100);
    game.start(level, () => .9);
    assert.notEqual(game.cards.map(c => c.id).join(), oldDeck);
    assert.equal(game.moves, 0);
    assert.equal(game.score, 0);
    assert.equal(game.speedBonus, 0);
    assert.equal(game.performance().accuracy, 0);
    assert.equal(game.performance().stars, 0);
    assert.equal(game.matches, 0);
    assert.equal(game.startedAt, null);
    assert.equal(game.endedAt, null);
    assert.deepEqual(game.open, []);
    assert.equal(game.locked, false);
  });
}

test('ready state cannot flip and time remains zero before first flip', () => {
  const game = new MemoryGame();
  assert.equal(game.flip(0).type, 'ignored');
  game.start('easy');
  assert.equal(game.elapsed(1000000), 0);
  game.flip(0, 1000);
  assert.equal(game.elapsed(3500), 2500);
  assert.equal(game.moves, 0);
});

test('double-clicking a card cannot match it or count a move', () => {
  const game = new MemoryGame();
  game.start('easy');
  game.flip(0);
  assert.equal(game.flip(0).type, 'ignored');
  assert.equal(game.moves, 0);
  assert.equal(game.matches, 0);
});

test('mismatch locks out a third card, counts one move, then resolves', () => {
  const game = new MemoryGame();
  game.start('easy');
  const other = game.cards.findIndex(c => c.pair !== game.cards[0].pair);
  game.flip(0);
  assert.equal(game.flip(other).type, 'mismatch');
  assert.equal(game.moves, 1);
  assert.equal(game.flip((other + 1) % 16).type, 'ignored');
  assert.equal(game.open.length, 2);
  assert.equal(game.resolveMismatch(), true);
  assert.equal(game.open.length, 0);
  assert.equal(game.locked, false);
  assert.equal(game.score, 0);
  assert.equal(game.resolveMismatch(), false);
  assert.equal(game.flip(0).type, 'first');
});

test('matched cards cannot be reused', () => {
  const game = new MemoryGame();
  game.start('easy');
  const other = game.cards.findIndex((c, i) => i !== 0 && c.pair === game.cards[0].pair);
  game.flip(0);
  game.flip(other);
  assert.equal(game.flip(0).type, 'ignored');
  assert.equal(game.score, 100);
  assert.equal(game.moves, 1);
});

test('invalid card indexes do not mutate game state', () => {
  const game = new MemoryGame();
  game.start('hard');
  for (const index of [-1, 36, NaN, undefined]) assert.equal(game.flip(index).type, 'ignored');
  assert.equal(game.startedAt, null);
  assert.deepEqual(game.open, []);
});

test('invalid difficulty is rejected without replacing a running game', () => {
  const game = new MemoryGame();
  game.start('easy');
  assert.throws(() => game.start('impossible'));
  assert.equal(game.level, 'easy');
  assert.equal(game.cards.length, 16);
});

test('shuffle returns a new permutation without mutating the input', () => {
  const original = [1, 2, 3, 4, 5];
  const result = shuffle(original, () => 0);
  assert.deepEqual(original, [1, 2, 3, 4, 5]);
  assert.notDeepEqual(result, original);
  assert.deepEqual([...result].sort(), original);
  assert.equal(SYMBOLS.length, new Set(SYMBOLS.map(s => s[0])).size);
});

test('timer formatting handles minutes, hours, and subsecond rounding', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(999), '00:00');
  assert.equal(formatTime(60000), '01:00');
  assert.equal(formatTime(3661000), '61:01');
});

test('timer treats a zero-valued start timestamp as started', () => {
  const game = new MemoryGame();
  game.start('easy');
  game.flip(0, 0);
  assert.equal(game.elapsed(1500), 1500);
});
