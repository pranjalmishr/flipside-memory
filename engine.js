/* Pure game rules: no DOM, timers, or storage. Also available to Node's test runner. */
(function (root) {
  'use strict';
  const { CARD_THEMES, DEFAULT_PREFERENCES } = typeof module !== 'undefined' && module.exports
    ? require('./themes.js') : root.FlipSideThemes;
  const LEVELS = Object.freeze({
    easy: Object.freeze({ name: 'Easy', rows: 4, columns: 4, pairs: 8, targetSeconds: 60, badge: 'Easy breezy' }),
    medium: Object.freeze({ name: 'Medium', rows: 4, columns: 5, pairs: 10, targetSeconds: 90, badge: 'A little challenge' }),
    hard: Object.freeze({ name: 'Hard', rows: 6, columns: 6, pairs: 18, targetSeconds: 180, badge: 'Big brain energy' }),
  });
  const POINTS_PER_PAIR = 100;
  const POINTS_PER_SECOND = 5;
  const POWER_LIMITS = Object.freeze({ hints: 3, shuffles: 2 });
  const makeRunId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  // Accuracy uses completed two-card attempts only. Keep the raw ratio for star
  // thresholds; rounding a 79.6% result to 80% must not award a third star.
  function calculatePerformance(level, matches, moves, elapsed, completed = false) {
    const config = LEVELS[level];
    if (!Object.hasOwn(LEVELS, level)) throw new Error('Unknown difficulty');
    const accuracy = moves === 0 ? 0 : matches / moves * 100;
    const secondsSaved = Math.max(0, Math.floor((config.targetSeconds * 1000 - elapsed) / 1000));
    const potentialBonus = secondsSaved * POINTS_PER_SECOND;
    const pairPoints = matches * POINTS_PER_PAIR;
    let stars = 0;
    if (completed) {
      stars = accuracy >= 80 && elapsed <= config.targetSeconds * 1000 ? 3
        : accuracy >= 50 && elapsed <= config.targetSeconds * 2000 ? 2 : 1;
    }
    const speedBonus = completed ? potentialBonus : 0;
    return Object.freeze({ accuracy, pairPoints, potentialBonus, speedBonus,
      totalScore: pairPoints + speedBonus, stars, targetSeconds: config.targetSeconds });
  }
  // Keep the original tuple export available for existing engine consumers.
  const SYMBOLS = Object.freeze(CARD_THEMES[DEFAULT_PREFERENCES.collection].designs.map(c => Object.freeze([c.emoji, c.name])));

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function createDeck(level, random = Math.random, theme = DEFAULT_PREFERENCES.collection) {
    if (!Object.hasOwn(LEVELS, level)) throw new Error('Unknown difficulty');
    if (!Object.hasOwn(CARD_THEMES, theme)) throw new Error('Unknown card collection');
    const designs = shuffle(CARD_THEMES[theme].designs, random).slice(0, LEVELS[level].pairs);
    return shuffle(designs.flatMap((design, pair) => [0, 1].map(copy => ({
      ...design, id: `${pair}-${copy}`, pair, theme, matched: false,
    }))), random);
  }

  class MemoryGame {
    constructor() {
      this.status = 'ready';
      this.level = 'easy';
      this.theme = DEFAULT_PREFERENCES.collection;
      this.cards = createDeck('easy');
      this.open = [];
      this.moves = 0;
      this.matches = 0;
      this.score = 0;
      this.speedBonus = 0;
      this.startedAt = null;
      this.endedAt = null;
      this.locked = false;
      this.effect = null;
      this.hintOpen = [];
      this.hintsUsed = 0;
      this.shufflesUsed = 0;
      this.pausedAt = null;
      this.pausedTotal = 0;
      this.id = null;
    }

    start(level, random = Math.random, theme = this.theme) {
      const cards = createDeck(level, random, theme);
      Object.assign(this, { level, theme, cards, status: 'playing', open: [], moves: 0,
        matches: 0, score: 0, speedBonus: 0, startedAt: null, endedAt: null, locked: false,
        effect: null, hintOpen: [], hintsUsed: 0, shufflesUsed: 0, pausedAt: null, pausedTotal: 0, id: makeRunId() });
    }

    flip(index, now = Date.now()) {
      if (!Number.isInteger(index) || index < 0 || index >= this.cards.length) return { type: 'ignored' };
      const card = this.cards[index];
      if (this.status !== 'playing' || this.locked || !card || card.matched || this.open.includes(index)) {
        return { type: 'ignored' };
      }
      this.beginClock(now);
      this.open.push(index);
      if (this.open.length === 1) return { type: 'first', name: card.name };
      this.moves++;
      const [first, second] = this.open.map(i => this.cards[i]);
      if (first.pair !== second.pair) {
        this.locked = true;
        this.effect = 'mismatch';
        return { type: 'mismatch', names: [first.name, second.name] };
      }
      first.matched = second.matched = true;
      this.open = [];
      this.matches++;
      this.score += POINTS_PER_PAIR;
      if (this.matches === LEVELS[this.level].pairs) {
        this.status = 'won';
        this.endedAt = now;
        this.speedBonus = this.performance(now).speedBonus;
        this.score += this.speedBonus;
        return { type: 'win', name: card.name };
      }
      return { type: 'match', name: card.name };
    }

    resolveMismatch() {
      if (this.status !== 'playing' || this.effect !== 'mismatch') return false;
      this.open = [];
      this.locked = false;
      this.effect = null;
      return true;
    }

    beginClock(now) {
      if (this.startedAt === null) { this.startedAt = now; this.pausedTotal = 0; }
    }

    pause(now = Date.now()) {
      if (this.status !== 'playing') return false;
      this.status = 'paused';
      this.pausedAt = now;
      return true;
    }

    resume(now = Date.now()) {
      if (this.status !== 'paused') return false;
      if (this.startedAt !== null) this.pausedTotal += Math.max(0, now - this.pausedAt);
      this.pausedAt = null;
      this.status = 'playing';
      return true;
    }

    useHint(now = Date.now(), random = Math.random) {
      if (this.status !== 'playing' || this.locked || this.open.length || this.hintsUsed >= POWER_LIMITS.hints) return false;
      const available = [...new Set(this.cards.filter(c => !c.matched).map(c => c.pair))];
      if (!available.length) return false;
      const pair = available[Math.floor(random() * available.length)];
      this.beginClock(now);
      this.hintsUsed++;
      this.hintOpen = this.cards.flatMap((card, index) => card.pair === pair ? [index] : []);
      this.effect = 'hint';
      this.locked = true;
      return true;
    }

    resolveHint() {
      if (this.status !== 'playing' || this.effect !== 'hint') return false;
      this.hintOpen = [];
      this.effect = null;
      this.locked = false;
      return true;
    }

    useShuffle(now = Date.now(), random = Math.random) {
      const slots = this.cards.flatMap((c, i) => !c.matched ? [i] : []);
      if (this.status !== 'playing' || this.locked || this.open.length || slots.length < 4 || this.shufflesUsed >= POWER_LIMITS.shuffles) return false;
      this.beginClock(now);
      this.shufflesUsed++;
      const original = slots.map(i => this.cards[i]);
      let rearranged = shuffle(original, random);
      if (rearranged.every((c, i) => c.id === original[i].id)) rearranged = [...original.slice(1), original[0]];
      slots.forEach((slot, i) => { this.cards[slot] = rearranged[i]; });
      return true;
    }

    snapshot(now = Date.now()) {
      if (!['playing', 'paused'].includes(this.status)) return null;
      return { version: 1, id: this.id, level: this.level, theme: this.theme,
        cards: this.cards.map(({ id, key, pair, matched }) => ({ id, key, pair, matched })),
        moves: this.moves, elapsedMs: this.elapsed(now), hasStarted: this.startedAt !== null,
        hintsUsed: this.hintsUsed, shufflesUsed: this.shufflesUsed };
    }

    restore(snapshot, now = Date.now()) {
      // Only catalog keys are deserialized. Never trust HTML, score, stars, or artwork from storage.
      try {
        const s = snapshot;
        if (!s || s.version !== 1 || !Object.hasOwn(LEVELS, s.level) || !Object.hasOwn(CARD_THEMES, s.theme) ||
            typeof s.id !== 'string' || !/^[a-zA-Z0-9-]{6,100}$/.test(s.id)) return false;
        const config = LEVELS[s.level];
        const validInt = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
        if (!Array.isArray(s.cards) || s.cards.length !== config.pairs * 2 || !validInt(s.moves, 1000000) ||
            !Number.isFinite(s.elapsedMs) || s.elapsedMs < 0 || s.elapsedMs > 31536000000 || typeof s.hasStarted !== 'boolean' ||
            !validInt(s.hintsUsed, POWER_LIMITS.hints) || !validInt(s.shufflesUsed, POWER_LIMITS.shuffles)) return false;
        const catalog = new Map(CARD_THEMES[s.theme].designs.map(c => [c.key, c]));
        const cards = s.cards.map(c => {
          if (!c || !catalog.has(c.key) || !validInt(c.pair, config.pairs - 1) || typeof c.matched !== 'boolean' ||
              typeof c.id !== 'string' || !/^\d+-[01]$/.test(c.id)) throw new Error('Invalid saved card');
          return { ...catalog.get(c.key), id: c.id, pair: c.pair, matched: c.matched, theme: s.theme };
        });
        if (new Set(cards.map(c => c.id)).size !== cards.length || new Set(cards.map(c => c.key)).size !== config.pairs) return false;
        for (let pair = 0; pair < config.pairs; pair++) {
          const twins = cards.filter(c => c.pair === pair);
          if (twins.length !== 2 || twins[0].key !== twins[1].key || twins[0].matched !== twins[1].matched) return false;
        }
        const matches = cards.filter(c => c.matched).length / 2;
        if (matches >= config.pairs || s.moves < matches || (!s.hasStarted && (s.moves || matches || s.elapsedMs || s.hintsUsed || s.shufflesUsed))) return false;
        Object.assign(this, { id: s.id, level: s.level, theme: s.theme, cards, moves: s.moves, matches,
          score: matches * POINTS_PER_PAIR, speedBonus: 0, startedAt: s.hasStarted ? now - s.elapsedMs : null,
          endedAt: null, pausedAt: now, pausedTotal: 0, status: 'paused', open: [], hintOpen: [], locked: false,
          effect: null, hintsUsed: s.hintsUsed, shufflesUsed: s.shufflesUsed });
        return true;
      } catch { return false; }
    }

    elapsed(now = Date.now()) {
      if (this.startedAt === null) return 0;
      return Math.max(0, (this.endedAt ?? this.pausedAt ?? now) - this.startedAt - this.pausedTotal);
    }

    performance(now = Date.now()) {
      return calculatePerformance(this.level, this.matches, this.moves, this.elapsed(now), this.status === 'won');
    }
  }

  function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  const api = { LEVELS, SYMBOLS, CARD_THEMES, POINTS_PER_PAIR, POINTS_PER_SECOND, POWER_LIMITS,
    calculatePerformance, shuffle, createDeck, MemoryGame, formatTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlipSide = api;
})(globalThis);
