const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS, createDeck, MemoryGame } = require('../engine.js');
const { CARD_THEMES, CARD_BACKS, BOARD_COLORS, APPEARANCES, DEFAULT_PREFERENCES, normalizePreferences, renderFace } = require('../themes.js');

for (const [theme, collection] of Object.entries(CARD_THEMES)) {
  test(`${theme}: 20 distinct, named, immutable matching designs`, () => {
    assert.equal(collection.designs.length, 20);
    assert.equal(new Set(collection.designs.map(c => c.key)).size, 20);
    assert.equal(new Set(collection.designs.map(c => c.name)).size, 20);
    assert.equal(new Set(collection.designs.map(renderFace)).size, 20);
    assert.ok(collection.designs.every(c => c.key && c.name && (c.emoji || c.art)));
    assert.ok(Object.isFrozen(collection) && Object.isFrozen(collection.designs));
    assert.ok(collection.designs.every(Object.isFrozen));
    for (const design of collection.designs) {
      if (design.art) assert.match(design.art, /^<svg.*viewBox="0 0 64 64"/);
      assert.doesNotMatch(renderFace(design), /<script|onerror|onload|(?:href|src)=["']https?:|<image/i);
    }
  });

  for (const [level, config] of Object.entries(LEVELS)) {
    test(`${theme} ${level}: correct deck, no repeated designs beyond their exact pair`, () => {
      const deck = createDeck(level, Math.random, theme);
      assert.equal(deck.length, config.pairs * 2);
      assert.equal(new Set(deck.map(c => c.id)).size, deck.length);
      assert.equal(new Set(deck.map(c => c.key)).size, config.pairs);
      for (const key of new Set(deck.map(c => c.key))) {
        const pair = deck.filter(c => c.key === key);
        assert.equal(pair.length, 2);
        assert.equal(pair[0].pair, pair[1].pair);
        assert.equal(renderFace(pair[0]), renderFace(pair[1]));
      }
      assert.ok(deck.every(c => c.theme === theme && collection.designs.some(d => d.key === c.key)));
    });

    test(`${theme} ${level}: complete game preserves scoring, accuracy, and stars`, () => {
      const game = new MemoryGame();
      game.start(level, Math.random, theme);
      assert.equal(game.theme, theme);
      let now = 1000;
      for (let pair = 0; pair < config.pairs; pair++) {
        for (const index of game.cards.flatMap((c, i) => c.pair === pair ? [i] : [])) game.flip(index, now += 500);
      }
      assert.equal(game.status, 'won');
      assert.equal(game.matches, config.pairs);
      assert.equal(game.moves, config.pairs);
      assert.equal(game.performance().accuracy, 100);
      assert.equal(game.performance().stars, 3);
      assert.equal(game.score, config.pairs * 100 + game.speedBonus);
    });
  }
}

test('all six collections use different artwork, not just renamed copies', () => {
  const designs = Object.values(CARD_THEMES).flatMap(c => c.designs);
  assert.equal(designs.length, 120);
  assert.equal(new Set(designs.map(renderFace)).size, 120);
  assert.deepEqual(Object.keys(CARD_THEMES), ['animals', 'emojis', 'fruits', 'space', 'nature', 'technology']);
});

test('theme restart stays in the same collection and reshuffles positions', () => {
  const game = new MemoryGame();
  game.start('hard', () => .1, 'space');
  const old = game.cards.map(c => c.id).join();
  game.flip(0, 0);
  game.start('hard', () => .9);
  assert.equal(game.theme, 'space');
  assert.notEqual(game.cards.map(c => c.id).join(), old);
  assert.equal(game.score, 0);
  assert.equal(game.startedAt, null);
});

test('invalid collections cannot mutate an existing game', () => {
  const game = new MemoryGame();
  game.start('medium', Math.random, 'animals');
  const cards = game.cards;
  for (const invalid of ['constructor', 'toString', '__proto__', 'missing', null]) {
    assert.throws(() => game.start('hard', Math.random, invalid));
    assert.equal(game.cards, cards);
    assert.equal(game.theme, 'animals');
    assert.equal(game.level, 'medium');
  }
});

test('appearance preferences validate each choice independently', () => {
  assert.deepEqual(normalizePreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(normalizePreferences([]), DEFAULT_PREFERENCES);
  assert.deepEqual(normalizePreferences('space'), DEFAULT_PREFERENCES);
  assert.deepEqual(normalizePreferences({ collection: 'space', back: 'waves', board: 'mint', appearance: 'midnight' }),
    { collection: 'space', back: 'waves', board: 'mint', appearance: 'midnight' });
  assert.deepEqual(normalizePreferences({ collection: 'animals', back: 'constructor', board: '#000', appearance: 123, unknown: 'value' }),
    { collection: 'animals', back: 'sparkle', board: 'paper', appearance: 'daydream' });
  assert.deepEqual(normalizePreferences(JSON.parse('{"__proto__":{"collection":"space"}}')), DEFAULT_PREFERENCES);
});

test('four backs, five board colors, and three appearances are independent choices', () => {
  assert.equal(Object.keys(CARD_BACKS).length, 4);
  assert.equal(new Set(Object.values(CARD_BACKS).map(c => c.art)).size, 4);
  assert.equal(Object.keys(BOARD_COLORS).length, 5);
  assert.equal(new Set(Object.values(BOARD_COLORS).map(c => c.color)).size, 5);
  assert.equal(Object.keys(APPEARANCES).length, 3);
  assert.ok(Object.values(APPEARANCES).every(a => a.name && a.colors.length === 3));
});
