/* Shared date/ranking rules. Puzzle order and seed live only on the server. */
(function (root) {
  'use strict';
  const DAY_MS = 86400000;
  const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
  function dayNumber(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const n = Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(n) && utcDay(n) === day ? Math.floor(n / DAY_MS) : null;
  }
  const nextReset = day => (dayNumber(day) + 1) * DAY_MS;
  const compare = (a, b) => a.moves - b.moves || a.time - b.time || a.completedAt - b.completedAt || a.player.localeCompare(b.player);
  function streakFor(completedDays, today) {
    const days = new Set(completedDays.filter(day => dayNumber(day) !== null));
    let cursor = dayNumber(today);
    if (cursor === null) return 0;
    if (!days.has(utcDay(cursor * DAY_MS))) cursor--;
    let streak = 0;
    while (days.has(utcDay(cursor * DAY_MS))) { streak++; cursor--; }
    return streak;
  }
  // Credits are a personal reward balance, not cash or additional leaderboard points.
  const rewardFor = streak => 100 + 10 * Math.min(Math.max(streak - 1, 0), 6);
  const api = { DAY_MS, utcDay, dayNumber, nextReset, compare, streakFor, rewardFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlipSideDailyRules = api;
})(globalThis);
