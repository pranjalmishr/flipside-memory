/* Transactional in-memory store for isolated tests only; never used in production. */
class MemoryStore {
  constructor() { this.docs = new Map(); this.queue = Promise.resolve(); }
  async transaction(fn) {
    const previous = this.queue; let release; this.queue = new Promise(resolve => { release = resolve; });
    await previous;
    const staged = new Map();
    try {
      const result = await fn({ getAll: async paths => paths.map(path => structuredClone(staged.get(path) ?? this.docs.get(path) ?? null)), set: (path, value) => staged.set(path, structuredClone(value)) });
      for (const [path, value] of staged) this.docs.set(path, value);
      return result;
    } finally { release(); }
  }
  async leaderboard(path, limit) { return [...this.docs].filter(([key]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1).map(([, value]) => structuredClone(value)).sort((a, b) => a.rankKey.localeCompare(b.rankKey)).slice(0, limit); }
  async rank(path, key) { return (await this.leaderboard(path, 10000)).filter(e => e.rankKey < key).length + 1; }
}
module.exports = { MemoryStore };
