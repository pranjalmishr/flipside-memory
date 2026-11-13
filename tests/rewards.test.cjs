const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS, MemoryGame, calculatePerformance } = require('../engine.js');

for (const [level, { pairs, targetSeconds }] of Object.entries(LEVELS)) {
  const target = targetSeconds * 1000;

  test(`${level}: bonus uses whole seconds saved, never goes below zero, and is completion-only`, () => {
    assert.equal(calculatePerformance(level, 1, 2, 0).speedBonus, 0);
    assert.equal(calculatePerformance(level, 1, 2, 0).potentialBonus, targetSeconds * 5);
    assert.equal(calculatePerformance(level, pairs, pairs, target - 20000, true).speedBonus, 100);
    assert.equal(calculatePerformance(level, pairs, pairs, target - 1000, true).speedBonus, 5);
    assert.equal(calculatePerformance(level, pairs, pairs, target - 999, true).speedBonus, 0);
    assert.equal(calculatePerformance(level, pairs, pairs, target, true).speedBonus, 0);
    assert.equal(calculatePerformance(level, pairs, pairs, target + 100000, true).speedBonus, 0);
  });

  test(`${level}: faster completion gives a larger bonus with identical moves and matches`, () => {
    const fast = calculatePerformance(level, pairs, pairs, 10000, true);
    const slow = calculatePerformance(level, pairs, pairs, 20000, true);
    assert.equal(fast.totalScore - slow.totalScore, 50);
    assert.equal(fast.pairPoints, pairs * 100);
    assert.equal(fast.totalScore, fast.pairPoints + fast.speedBonus);
  });

  test(`${level}: time limits affect star rewards at exact boundaries`, () => {
    assert.equal(calculatePerformance(level, pairs, pairs, target, true).stars, 3);
    assert.equal(calculatePerformance(level, pairs, pairs, target + 1, true).stars, 2);
    assert.equal(calculatePerformance(level, pairs, pairs, target * 2, true).stars, 2);
    assert.equal(calculatePerformance(level, pairs, pairs, target * 2 + 1, true).stars, 1);
    assert.equal(calculatePerformance(level, pairs - 1, pairs, 1000).stars, 0);
  });
}

test('accuracy tracks matches divided by completed attempts, never individual flips', () => {
  const game = new MemoryGame();
  game.start('easy');
  assert.equal(game.performance().accuracy, 0);
  game.flip(0, 1000);
  assert.equal(game.performance().accuracy, 0);
  const other = game.cards.findIndex(c => c.pair !== game.cards[0].pair);
  game.flip(other, 2000);
  assert.equal(game.performance().accuracy, 0);
  game.resolveMismatch();
  const twin = game.cards.findIndex((c, i) => i !== 0 && c.pair === game.cards[0].pair);
  game.flip(0, 3000);
  game.flip(twin, 4000);
  assert.equal(game.moves, 2);
  assert.equal(game.performance().accuracy, 50);
  const next = game.cards.findIndex(c => !c.matched);
  game.flip(next, 5000);
  game.flip(next, 5100); // duplicate input does not change the ratio
  assert.equal(game.performance().accuracy, 50);
});

test('star accuracy thresholds are inclusive and use raw precision', () => {
  assert.equal(calculatePerformance('easy', 8, 10, 1000, true).stars, 3); // 80%
  assert.equal(calculatePerformance('easy', 8, 11, 1000, true).stars, 2);
  assert.equal(calculatePerformance('easy', 8, 16, 1000, true).stars, 2); // 50%
  assert.equal(calculatePerformance('easy', 8, 17, 1000, true).stars, 1);
  const almost80 = calculatePerformance('easy', 1999, 2500, 1000, true);
  assert.ok(almost80.accuracy < 80);
  assert.equal(almost80.stars, 2);
});

test('final score receives the completion bonus exactly once and remains frozen', () => {
  const game = new MemoryGame();
  game.start('easy');
  const pairs = new Map();
  game.cards.forEach((c, i) => pairs.set(c.pair, [...(pairs.get(c.pair) || []), i]));
  let now = 0;
  for (const pair of pairs.values()) {
    assert.equal(game.speedBonus, 0);
    game.flip(pair[0], now);
    now += 1000;
    game.flip(pair[1], now);
    now += 1000;
  }
  // Final match occurred at 15 seconds: 45 full seconds saved × 5.
  assert.equal(game.score, 800 + 225);
  assert.equal(game.speedBonus, 225);
  const result = game.performance(999999);
  assert.equal(result.totalScore, game.score);
  assert.equal(result.speedBonus, 225);
  assert.equal(result.stars, 3);
  assert.equal(game.flip(0, 999999).type, 'ignored');
  assert.equal(game.resolveMismatch(), false);
  assert.deepEqual(game.performance(9999999), result);
  assert.equal(game.score, 1025);
  game.start('medium');
  assert.equal(game.score, 0);
  assert.equal(game.speedBonus, 0);
  assert.equal(game.performance().stars, 0);
  assert.equal(game.performance().accuracy, 0);
  assert.equal(game.performance().potentialBonus, 450);
});

test('invalid difficulty names, including prototype properties, are rejected', () => {
  for (const level of ['constructor', 'toString', '__proto__', 'missing']) {
    assert.throws(() => calculatePerformance(level, 0, 0, 0));
    assert.throws(() => new MemoryGame().start(level));
  }
});
