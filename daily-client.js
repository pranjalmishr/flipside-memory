/* Isolated anonymous guest identity, authenticated daily requests, and retry-safe actions. */
(function (root) {
  'use strict';
  const SESSION = 'flipside-daily-guest-v1';
  class DailyClientError extends Error {
    constructor(message, code = 'unavailable', status = 0) { super(message); this.code = code; this.status = status; }
  }
  class DailyClient {
    constructor(storage, fetchImpl = root.fetch.bind(root)) {
      this.storage = storage; this.fetch = fetchImpl; this.config = null; this.session = null; this.authWork = null;
      try {
        const saved = JSON.parse(storage?.getItem(SESSION) || 'null');
        if (saved && typeof saved.refreshToken === 'string' && saved.refreshToken.length < 10000 && typeof saved.uid === 'string') this.session = saved;
      } catch { /* Invalid or blocked local storage does not prevent a session in this tab. */ }
    }
    async json(url, options = {}) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await this.fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new DailyClientError(body.message || body.error?.message || 'Daily request failed.', typeof body.error === 'string' ? body.error : 'auth-error', response.status);
        return body;
      } catch (error) {
        if (error instanceof DailyClientError) throw error;
        throw new DailyClientError('Connection interrupted. Reconnect to recover your server-saved daily round.', 'network');
      } finally { clearTimeout(timeout); }
    }
    async configure() {
      if (!this.config) this.config = await this.json('/api/daily');
      if (!this.config.available || !this.config.apiKey) throw new DailyClientError('Daily online play is not available here. Practice remains playable.', 'not-configured');
      return this.config;
    }
    async token(force = false) {
      await this.configure();
      if (!force && this.session?.idToken && this.session.expiresAt > Date.now() + 60000) return this.session.idToken;
      if (this.authWork) return this.authWork;
      this.authWork = (async () => {
        let data;
        if (this.session) {
          data = await this.json(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.config.apiKey)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.session.refreshToken }) });
          this.session = { uid: data.user_id, idToken: data.id_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 };
        } else {
          data = await this.json(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(this.config.apiKey)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
          this.session = { uid: data.localId, idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn) * 1000 };
        }
        if (!this.session.uid || !this.session.idToken || !this.session.refreshToken || !Number.isFinite(this.session.expiresAt)) throw new DailyClientError('Guest authentication failed.', 'auth-error');
        try { this.storage?.setItem(SESSION, JSON.stringify(this.session)); } catch { /* Session remains available in memory. */ }
        return this.session.idToken;
      })().finally(() => { this.authWork = null; });
      return this.authWork;
    }
    async request(action, fields = {}) {
      const body = { action, ...fields };
      if (['start', 'flip'].includes(action)) body.requestId ||= root.crypto.randomUUID();
      let last;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const token = await this.token(attempt > 0 && last?.status === 401);
          return await this.json('/api/daily', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
        } catch (error) {
          last = error;
          if (!(error.code === 'network' || error.status === 401 || error.status === 503)) throw error;
        }
      }
      throw last;
    }
  }
  const api = { SESSION, DailyClient, DailyClientError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlipSideDailyClient = api;
})(globalThis);
