const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryGame, LEVELS, CARD_THEMES, POWER_LIMITS } = require('../engine.js');
const pairFor = (game, pair = 0) => game.cards.flatMap((c, i) => c.pair === pair ? [i] : []);
const match = (game, pair, now) => pairFor(game, pair).forEach(i => game.flip(i, now));

test('pausing before the first flip never starts the timer', () => {
  const game = new MemoryGame();
  assert.equal(game.pause(0), false);
  game.start('easy');
  assert.equal(game.pause(1000), true);
  assert.equal(game.elapsed(5000), 0);
  assert.equal(game.flip(0, 6000).type, 'ignored');
  assert.equal(game.resume(10000), true);
  game.flip(0, 12000);
  assert.equal(game.elapsed(15000), 3000);
});

test('multiple pauses exclude exactly the paused intervals and freeze bonus previews', () => {
  const game = new MemoryGame();
  game.start('easy');
  game.flip(0, 1000);
  game.pause(3000);
  const preview = game.performance(100000);
  assert.equal(game.elapsed(100000), 2000);
  assert.equal(game.pause(9000), false);
  game.resume(13000);
  assert.equal(game.resume(14000), false);
  game.pause(15000);
  assert.equal(game.elapsed(99999), 4000);
  assert.ok(game.performance(99999).potentialBonus < preview.potentialBonus);
  game.resume(25000);
  assert.equal(game.elapsed(27000), 6000);
});

test('a paused pending mismatch cannot resolve or accept additional input', () => {
  const game = new MemoryGame();
  game.start('easy');
  game.flip(0, 0);
  game.flip(game.cards.findIndex(c => c.pair !== game.cards[0].pair), 100);
  game.pause(200);
  assert.equal(game.resolveMismatch(), false);
  assert.equal(game.useHint(300), false);
  assert.equal(game.useShuffle(300), false);
  assert.equal(game.open.length, 2);
  game.resume(10000);
  assert.equal(game.resolveMismatch(), true);
  assert.equal(game.open.length, 0);
  assert.equal(game.moves, 1);
});

test('hints reveal exactly one unmatched pair with no score, moves, or matches', () => {
  const game = new MemoryGame();
  game.start('hard', Math.random, 'space');
  match(game, 0, 0);
  const score = game.score;
  for (let i = 0; i < POWER_LIMITS.hints; i++) {
    assert.equal(game.useHint(1000 + i * 2000), true);
    assert.equal(game.hintOpen.length, 2);
    const cards = game.hintOpen.map(index => game.cards[index]);
    assert.equal(cards[0].key, cards[1].key);
    assert.ok(cards.every(c => !c.matched));
    assert.equal(game.flip(0).type, 'ignored');
    assert.equal(game.resolveMismatch(), false);
    assert.equal(game.resolveHint(), true);
  }
  assert.equal(game.useHint(), false);
  assert.equal(game.hintsUsed, 3);
  assert.equal(game.moves, 1);
  assert.equal(game.matches, 1);
  assert.equal(game.score, score);
});

test('using the first hint starts time; pausing preserves the temporary reveal', () => {
  const game = new MemoryGame();
  game.start('easy');
  assert.equal(game.useHint(1000), true);
  assert.equal(game.elapsed(2000), 1000);
  game.pause(2200);
  assert.equal(game.resolveHint(), false);
  assert.equal(game.hintOpen.length, 2);
  game.resume(5200);
  assert.equal(game.resolveHint(), true);
  assert.equal(game.elapsed(5500), 1500);
});

test('shuffle moves only unmatched cards and guarantees changed positions', () => {
  const game = new MemoryGame();
  game.start('easy');
  match(game, 0, 1000);
  const matched = game.cards.map((c, i) => c.matched ? [i, c.id] : null).filter(Boolean);
  const ids = game.cards.map(c => c.id);
  assert.equal(game.useShuffle(2000, () => .999999), true); // Identity RNG triggers rotation fallback.
  assert.notDeepEqual(game.cards.map(c => c.id), ids);
  assert.deepEqual(game.cards.map(c => c.id).sort(), [...ids].sort());
  matched.forEach(([i, id]) => assert.equal(game.cards[i].id, id));
  assert.equal(game.moves, 1);
  assert.equal(game.score, 100);
  assert.equal(game.useShuffle(3000), true);
  assert.equal(game.useShuffle(4000), false);
  assert.equal(game.shufflesUsed, 2);
});

test('power-ups cannot be spent during an open turn or on the last unmatched pair', () => {
  const game = new MemoryGame();
  game.start('easy');
  game.flip(0, 0);
  assert.equal(game.useHint(100), false);
  assert.equal(game.useShuffle(100), false);
  game.start('easy');
  for (let pair = 0; pair < 7; pair++) match(game, pair, pair * 1000);
  assert.equal(game.useShuffle(8000), false);
  assert.equal(game.shufflesUsed, 0);
  assert.equal(game.useHint(8000), true);
});

for (const theme of Object.keys(CARD_THEMES)) {
  for (const level of Object.keys(LEVELS)) {
    test(`${theme} ${level}: progress round-trip restores position, matches, time, and power-ups paused`, () => {
      const game = new MemoryGame();
      game.start(level, Math.random, theme);
      match(game, 0, 1000);
      game.useHint(2000); game.resolveHint();
      game.useShuffle(3000);
      game.pause(4000);
      const snapshot = JSON.parse(JSON.stringify(game.snapshot(90000)));
      assert.equal(snapshot.elapsedMs, 3000);
      assert.ok(snapshot.cards.every(c => !('art' in c) && !('emoji' in c)));
      const restored = new MemoryGame();
      assert.equal(restored.restore(snapshot, 500000), true);
      assert.equal(restored.status, 'paused');
      assert.equal(restored.id, game.id);
      assert.equal(restored.score, 100);
      assert.equal(restored.moves, 1);
      assert.equal(restored.hintsUsed, 1);
      assert.equal(restored.shufflesUsed, 1);
      assert.deepEqual(restored.cards, game.cards);
      assert.equal(restored.elapsed(99999999), 3000);
      restored.resume(600000);
      assert.equal(restored.elapsed(601000), 4000);
    });
  }
}

test('restoring unfinished reveals closes them without refunding a hint or changing moves', () => {
  const game = new MemoryGame();
  game.start('easy');
  game.useHint(1000);
  const restored = new MemoryGame();
  assert.equal(restored.restore(game.snapshot(1500), 9000), true);
  assert.equal(restored.hintsUsed, 1);
  assert.equal(restored.moves, 0);
  assert.equal(restored.locked, false);
  assert.deepEqual(restored.hintOpen, []);
  restored.resume(10000);
  restored.flip(0, 10000);
  restored.flip(restored.cards.findIndex(c => c.pair !== restored.cards[0].pair), 10100);
  const next = new MemoryGame();
  next.restore(restored.snapshot(10200), 12000);
  assert.equal(next.moves, 1);
  assert.deepEqual(next.open, []);
});

test('saved progress is validated atomically and cannot inject artwork or a score', () => {
  const game = new MemoryGame();
  game.start('easy');
  match(game, 0, 0);
  const snapshot = game.snapshot(1000);
  const target = new MemoryGame();
  const original = target.cards;
  const mutate = fn => { const copy = structuredClone(snapshot); fn(copy); return copy; };
  const invalid = [null, {}, mutate(s => s.version = 2), mutate(s => s.theme = 'constructor'),
    mutate(s => s.cards[0].id = s.cards[1].id), mutate(s => s.cards[0].key = '<img onerror=alert(1)>'),
    mutate(s => s.cards.find(c => c.pair === 0).matched = false), mutate(s => s.cards.forEach(c => c.matched = true)),
    mutate(s => s.moves = -1), mutate(s => s.hasStarted = false), mutate(s => s.elapsedMs = NaN),
    mutate(s => s.elapsedMs = -10), mutate(s => s.hintsUsed = 4), mutate(s => s.shufflesUsed = 3)];
  for (const value of invalid) {
    assert.equal(target.restore(value), false);
    assert.equal(target.cards, original);
  }
  const safe = structuredClone(snapshot);
  safe.score = 100000;
  safe.cards.forEach(c => { c.art = '<script>bad()</script>'; c.emoji = 'fake'; });
  assert.equal(target.restore(safe), true);
  assert.equal(target.score, 100);
  assert.ok(target.cards.every(c => !c.art && c.emoji !== 'fake'));
});

test('restart creates a new run identity and resets pauses and power-up limits', () => {
  const game = new MemoryGame();
  game.start('easy');
  const id = game.id;
  game.useHint(0); game.resolveHint(); game.useShuffle(10); game.pause(100);
  game.start('easy');
  assert.notEqual(game.id, id);
  assert.equal(game.hintsUsed, 0);
  assert.equal(game.shufflesUsed, 0);
  assert.equal(game.pausedTotal, 0);
  assert.equal(game.pausedAt, null);
  assert.equal(game.snapshot(0).hasStarted, false);
  const empty = new MemoryGame();
  assert.equal(empty.snapshot(), null);
});
