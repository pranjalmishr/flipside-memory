const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createHandler } = require('../server/http.cjs');
const { MemoryStore } = require('./daily-store.cjs');
const { DailyClient } = require('../daily-client.js');
const config = { available: true, apiKey: 'public-test-key', projectId: 'nitre-d8cdd' };
function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function memoryStorage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
async function call(handler, { method = 'POST', headers = {}, body } = {}) {
  const req = Readable.from([]); req.method = method; req.headers = { 'content-type': 'application/json', authorization: 'Bearer valid-token', origin: 'https://flipside-memory.vercel.app', ...headers }; req.body = body;
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler(req, res); return res;
}
function handler() {
  return createHandler({ getCloud: async () => ({ store: new MemoryStore(), auth: { verifyIdToken: async token => { if (token !== 'valid-token') throw new Error('Invalid'); return { uid: 'alice' }; } } }), secret: () => 'test-secret-only-never-production-123456789', apiKey: () => 'public-test-key', now: () => Date.parse('2026-11-17T12:00:00Z') });
}

test('daily configuration exposes only public auth configuration, not server secrets', async () => {
  const res = await call(handler(), { method: 'GET' });
  assert.equal(res.statusCode, 200); assert.equal(res.body.available, true);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(res.body).includes('test-secret'));
});

test('daily endpoint rejects bad origins, missing/forged tokens, methods, content types, and invalid JSON', async () => {
  const cases = [
    [{ headers: { origin: 'https://evil.example' }, body: { action: 'overview' } }, 403],
    [{ headers: { authorization: '' }, body: { action: 'overview' } }, 401],
    [{ headers: { authorization: 'Bearer forged' }, body: { action: 'overview' } }, 401],
    [{ method: 'DELETE' }, 405], [{ headers: { 'content-type': 'text/plain' } }, 415],
    [{ body: '{bad json' }, 400], [{ body: 'x'.repeat(5000) }, 413],
  ];
  for (const [input, code] of cases) assert.equal((await call(handler(), input)).statusCode, code);
});

test('cloud failures are reported as unavailable without leaking internal credentials or stack traces', async () => {
  const h = createHandler({ getCloud: async () => { throw new Error('private-credential-value'); } });
  const original = console.error; console.error = () => {};
  try { const res = await call(h, { body: { action: 'overview' } }); assert.equal(res.statusCode, 503); assert.ok(!JSON.stringify(res.body).includes('private-credential')); }
  finally { console.error = original; }
});

test('guest sign-in is isolated and shared concurrent requests create only one guest identity', async () => {
  let signs = 0;
  const client = new DailyClient(memoryStorage(), async (url, options) => {
    if (url === '/api/daily' && !options.method) return response(200, config);
    if (url.includes('signUp')) { signs++; return response(200, { localId: 'alice', idToken: 'valid', refreshToken: 'refresh', expiresIn: '3600' }); }
    return response(200, { okay: true });
  });
  await Promise.all([client.request('overview'), client.request('state')]);
  assert.equal(signs, 1); assert.equal(client.session.uid, 'alice');
});

test('client refreshes an existing guest instead of creating a new identity after reload', async () => {
  const storage = memoryStorage(); storage.setItem('flipside-daily-guest-v1', JSON.stringify({ uid: 'alice', refreshToken: 'old', idToken: 'expired', expiresAt: 0 }));
  let refreshes = 0, signs = 0;
  const client = new DailyClient(storage, async (url, options) => {
    if (url === '/api/daily' && !options.method) return response(200, config);
    if (url.includes('securetoken')) { refreshes++; return response(200, { user_id: 'alice', id_token: 'new', refresh_token: 'new-refresh', expires_in: '3600' }); }
    if (url.includes('signUp')) signs++;
    assert.equal(options.headers.Authorization, 'Bearer new'); return response(200, { okay: true });
  });
  await client.request('overview'); assert.equal(refreshes, 1); assert.equal(signs, 0);
});

test('network retry reuses the exact action ID so an already committed flip cannot apply twice', async () => {
  const client = new DailyClient(null, async () => {});
  client.config = config; client.session = { uid: 'alice', idToken: 'valid', refreshToken: 'refresh', expiresAt: Date.now() + 3600000 };
  const bodies = [];
  client.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); if (bodies.length === 1) throw new Error('lost response'); return response(200, { okay: true }); };
  await client.request('flip', { index: 0, expectedVersion: 0 });
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]);
});

test('guest identity stays usable in memory if browser storage is blocked', async () => {
  const client = new DailyClient({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, async (url, options) => {
    if (url === '/api/daily' && !options.method) return response(200, config);
    if (url.includes('signUp')) return response(200, { localId: 'alice', idToken: 'valid', refreshToken: 'refresh', expiresIn: '3600' });
    return response(200, { okay: true });
  });
  await client.request('overview'); assert.equal(client.session.uid, 'alice');
});

test('missing daily configuration reports unavailable and never signs in or simulates scores', async () => {
  let requests = 0;
  const client = new DailyClient(null, async () => { requests++; return response(200, { available: false }); });
  await assert.rejects(client.request('overview'), error => error.code === 'not-configured');
  assert.equal(requests, 1); assert.equal(client.session, null);
});
