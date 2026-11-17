const { createDailyService, DailyError } = require('./daily-service.cjs');
const { utcDay } = require('../daily-rules.js');
function createHandler({ getCloud, secret = () => process.env.FLIPSIDE_DAILY_SEED, apiKey = () => process.env.FLIPSIDE_FIREBASE_API_KEY,
  origins = ['https://flipside-memory.vercel.app', 'http://127.0.0.1:5195', 'http://localhost:5195'], now = Date.now }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) return reply(403, { error: 'origin-denied', message: 'This origin cannot use the daily service.' });
    if (req.method === 'GET') {
      const key = apiKey();
      return reply(200, { available: Boolean(key && secret()), today: utcDay(now()), serverNow: now(), projectId: 'nitre-d8cdd', apiKey: key || null });
    }
    if (req.method !== 'POST') return reply(405, { error: 'method-not-allowed', message: 'Use a JSON POST.' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { error: 'json-required', message: 'Send application/json.' });
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token || token.length > 4096) return reply(401, { error: 'auth-required', message: 'Your guest session is missing or expired.' });
    try {
      let body = req.body;
      if (body === undefined) {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 4096) throw new DailyError('body-too-large', 'Action too large.', 413); }
        try { body = JSON.parse(raw); } catch { throw new DailyError('invalid-json', 'Send a JSON action.', 400); }
      } else {
        if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 4096) throw new DailyError('body-too-large', 'Action too large.', 413);
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw new DailyError('invalid-json', 'Send a JSON action.', 400); } }
      }
      const cloud = await getCloud();
      let user; try { user = await cloud.auth.verifyIdToken(token); } catch { throw new DailyError('auth-required', 'Your guest session is expired. Reconnect and try again.', 401); }
      const result = await createDailyService({ store: cloud.store, secret: secret(), now }).execute(user.uid, body);
      return reply(200, result);
    } catch (error) {
      if (error instanceof DailyError) return reply(error.status, { error: error.code, message: error.message });
      console.error('FlipSide daily service failure:', error.code || error.name || 'unknown');
      return reply(503, { error: 'unavailable', message: 'The daily service is temporarily unavailable. Your practice game is still playable.' });
    }
  };
}
module.exports = { createHandler };
