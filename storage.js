/* Local-only persistence and validated personal leaderboard records. */
(function (root) {
  'use strict';
  const rules = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.FlipSide;
  const { LEVELS, CARD_THEMES, POWER_LIMITS, calculatePerformance } = rules;
  const KEYS = Object.freeze({ progress: 'flipside-progress-v1', leaderboard: 'flipside-runs-v1', audio: 'flipside-audio-v1' });
  const MAX_PER_LEVEL = 10;

  function normalizeRecord(value) {
    const r = value;
    if (!r || !Object.hasOwn(LEVELS, r.level) || !Object.hasOwn(CARD_THEMES, r.theme) ||
        typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{6,100}$/.test(r.id) ||
        !Number.isFinite(r.time) || r.time < 0 || r.time > 31536000000 ||
        !Number.isInteger(r.moves) || r.moves < LEVELS[r.level].pairs || r.moves > 1000000 ||
        !Number.isInteger(r.hintsUsed) || r.hintsUsed < 0 || r.hintsUsed > POWER_LIMITS.hints ||
        !Number.isInteger(r.shufflesUsed) || r.shufflesUsed < 0 || r.shufflesUsed > POWER_LIMITS.shuffles ||
        !Number.isFinite(r.completedAt) || r.completedAt < 0 || r.completedAt > 8640000000000000) return null;
    const performance = calculatePerformance(r.level, LEVELS[r.level].pairs, r.moves, r.time, true);
    if (r.score !== performance.totalScore) return null;
    return { id: r.id, level: r.level, theme: r.theme, time: r.time, moves: r.moves,
      hintsUsed: r.hintsUsed, shufflesUsed: r.shufflesUsed, completedAt: r.completedAt,
      score: performance.totalScore, accuracy: performance.accuracy, stars: performance.stars,
      assisted: r.hintsUsed > 0 || r.shufflesUsed > 0 };
  }

  const compareRecords = (a, b) => b.score - a.score || a.time - b.time || a.moves - b.moves || a.completedAt - b.completedAt || a.id.localeCompare(b.id);

  function normalizeLeaderboard(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.records)) return [];
    const unique = new Map();
    for (const item of value.records.slice(0, 1000)) {
      const record = normalizeRecord(item);
      if (record && !unique.has(record.id)) unique.set(record.id, record);
    }
    return Object.keys(LEVELS).flatMap(level => [...unique.values()].filter(r => r.level === level).sort(compareRecords).slice(0, MAX_PER_LEVEL));
  }

  function addResult(records, result) {
    return normalizeLeaderboard({ version: 1, records: [...records, result] });
  }

  function makeResult(game, now = Date.now()) {
    if (game.status !== 'won') return null;
    return normalizeRecord({ id: game.id, level: game.level, theme: game.theme, score: game.score,
      time: game.elapsed(), moves: game.moves, hintsUsed: game.hintsUsed,
      shufflesUsed: game.shufflesUsed, completedAt: now });
  }

  class SafeStore {
    constructor(storage) {
      this.memory = new Map();
      this.dirty = new Set();
      this.available = true;
      try { this.storage = storage === undefined ? root.localStorage : storage; }
      catch { this.storage = null; this.available = false; }
    }
    load(key, fallback = null) {
      if (this.dirty.has(key)) return this.memory.has(key) ? this.memory.get(key) : fallback;
      try {
        const raw = this.storage?.getItem(key);
        if (raw != null) { const value = JSON.parse(raw); this.memory.set(key, value); return value; }
        if (this.storage) { this.memory.delete(key); return fallback; }
      } catch { /* Invalid data and unavailable storage use a safe in-memory fallback. */ }
      return this.memory.has(key) ? this.memory.get(key) : fallback;
    }
    save(key, value) {
      this.memory.set(key, value);
      try {
        if (!this.storage) throw new Error('Storage unavailable');
        this.storage.setItem(key, JSON.stringify(value));
        this.dirty.delete(key);
        this.available = true;
      } catch { this.available = false; this.dirty.add(key); }
      return this.available;
    }
    remove(key) {
      this.memory.delete(key);
      try {
        if (!this.storage) throw new Error('Storage unavailable');
        this.storage.removeItem(key);
        this.dirty.delete(key);
        this.available = true;
      } catch { this.available = false; this.dirty.add(key); }
      return this.available;
    }
  }

  const api = { KEYS, MAX_PER_LEVEL, SafeStore, normalizeRecord, normalizeLeaderboard, compareRecords, addResult, makeResult };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlipSideStorage = api;
})(globalThis);
