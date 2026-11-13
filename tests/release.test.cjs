const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryGame, LEVELS, CARD_THEMES } = require('../engine.js');
const { GameAudio } = require('../audio.js');

function rng(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }

test('mixed-type and invalid card indexes cannot flip a card twice', () => {
  const game = new MemoryGame(); game.start('easy'); game.flip(0, 0);
  for (const index of ['0', new Number(0), null, undefined, {}, [], 1.5, NaN, Infinity, -1, 16]) {
    assert.equal(game.flip(index, 1).type, 'ignored');
  }
  assert.deepEqual(game.open, [0]); assert.equal(game.moves, 0); assert.equal(game.score, 0);
});

for (const [themeIndex, theme] of Object.keys(CARD_THEMES).entries()) {
  for (const [levelIndex, level] of Object.keys(LEVELS).entries()) {
    test(`${theme} ${level}: seeded state-transition stress preserves all invariants`, () => {
      const random = rng(100 + themeIndex * 10 + levelIndex);
      let game = new MemoryGame(); game.start(level, random, theme);
      const id = game.id;
      let now = 1000;
      for (let step = 0; step < 90 && game.status !== 'won'; step++) {
        now += 100 + Math.floor(random() * 300);
        const action = Math.floor(random() * 7);
        if (action === 0) game.useHint(now, random);
        else if (action === 1) game.useShuffle(now, random);
        else if (action === 2) {
          const elapsed = game.elapsed(now); game.pause(now); now += 2000;
          assert.equal(game.elapsed(now), elapsed); game.resume(now);
        } else if (action === 3) {
          const saved = game.snapshot(now); const loaded = new MemoryGame();
          assert.equal(loaded.restore(JSON.parse(JSON.stringify(saved)), now + 30000), true);
          now += 30000; loaded.resume(now); game = loaded;
        } else if (game.effect === 'hint') game.resolveHint();
        else if (game.effect === 'mismatch') game.resolveMismatch();
        else game.flip(Math.floor(random() * game.cards.length), now);
        assert.equal(game.id, id);
        assert.equal(new Set(game.cards.map(c => c.id)).size, game.cards.length);
        assert.equal(game.cards.filter(c => c.matched).length, game.matches * 2);
        assert.ok(game.moves >= game.matches && game.hintsUsed <= 3 && game.shufflesUsed <= 2);
        assert.equal(game.score, game.matches * 100 + (game.status === 'won' ? game.speedBonus : 0));
        assert.ok(Number.isFinite(game.elapsed(now)) && game.elapsed(now) >= 0);
      }
      if (game.effect === 'hint') game.resolveHint();
      if (game.effect === 'mismatch') game.resolveMismatch();
      if (game.open.length === 1) {
        const first = game.open[0];
        game.flip(game.cards.findIndex((c, i) => i !== first && c.pair === game.cards[first].pair), now += 100);
      }
      while (game.status !== 'won') {
        const first = game.cards.findIndex(c => !c.matched);
        const pair = game.cards[first].pair;
        for (const i of game.cards.flatMap((c, i) => c.pair === pair ? [i] : [])) game.flip(i, now += 100);
      }
      assert.equal(game.matches, LEVELS[level].pairs);
      assert.equal(game.performance(now).totalScore, game.score);
      assert.equal(game.snapshot(now), null);
    });
  }
}

test('queued audio from a previous game is cancelled before its context unlocks', async () => {
  let release;
  const audio = new GameAudio({ effects: true });
  audio.unlock = () => new Promise(resolve => { release = resolve; });
  let played = 0;
  audio.context = { currentTime: 0 };
  audio.note = () => played++;
  const pending = audio.effect('win');
  audio.cancelEffects(); release(); await pending;
  assert.equal(played, 0);
});

test('partially available or closed audio contexts never crash game controls', () => {
  const audio = new GameAudio({ music: true, effects: true });
  audio.context = { state: 'closed', currentTime: 0, close() { throw new Error('Already closed'); } };
  assert.doesNotThrow(() => audio.update({ musicVolume: .5 }));
  assert.doesNotThrow(() => audio.setPaused(true));
  assert.equal(audio.failed, true); assert.equal(audio.musicTimer, null);
  assert.doesNotThrow(() => audio.dispose());
});
