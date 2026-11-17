/* Local API preview. Test mode is explicit and cannot be deployed. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { createHandler } = require('../server/http.cjs');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5195);
const testMode = process.argv.includes('--test');
if (process.env.VERCEL === '1') throw new Error('Local preview is not a production entrypoint');
if (testMode) {
  const { MemoryStore } = require('../tests/daily-store.cjs');
  var store = new MemoryStore();
  var clock = Date.parse('2026-11-17T12:00:00Z');
  var cloud = { store, auth: { verifyIdToken: async token => { if (!/^test-user-[a-z0-9]+$/.test(token)) throw new Error('Invalid test token'); return { uid: token }; } } };
} else {
  const envFile = path.join(root, '.env.daily.local');
  if (!fs.existsSync(envFile)) throw new Error('Create the gitignored .env.daily.local using vercel env pull before running the real daily preview.');
  const values = parseEnv(fs.readFileSync(envFile, 'utf8'));
  for (const key of ['FIREBASE_PROJECT_ID', 'FLIPSIDE_SERVICE_ACCOUNT', 'FLIPSIDE_WIF_AUDIENCE', 'FLIPSIDE_FIREBASE_API_KEY', 'FLIPSIDE_DAILY_SEED']) if (values[key]) process.env[key] = values[key];
  const authFolder = path.join(require('node:os').homedir(), '.config/firebase');
  const file = fs.readdirSync(authFolder).find(name => name.endsWith('application_default_credentials.json'));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(authFolder, file);
}
const handler = createHandler({ getCloud: testMode ? async () => cloud : require('../server/cloud.cjs').getCloud,
  secret: testMode ? () => 'test-only-daily-secret-not-for-production-123456' : undefined,
  apiKey: testMode ? () => 'test-key' : undefined, now: testMode ? () => clock : Date.now,
  origins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`] });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  if (testMode && req.url === '/__test/reset' && req.method === 'POST') { store.docs.clear(); res.writeHead(200); res.end('{}'); return; }
  if (testMode && req.url === '/__test/clock' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    const value = JSON.parse(body); clock = value.now;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ now: clock })); return;
  }
  if (testMode && req.url.startsWith('/__test/deck?')) {
    const uid = new URL(req.url, 'http://localhost').searchParams.get('uid');
    const attempt = store.docs.get(`flipsideDaily/v1/days/${new Date(clock).toISOString().slice(0, 10)}/attempts/${uid}`);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(attempt?.game.cards || [])); return;
  }
  if (req.url.split('?')[0] === '/api/daily') return handler(req, res);
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.split('/').some(part => part.startsWith('.') || ['node_modules', 'tests', 'scripts', 'server'].includes(part))) throw new Error('Not found');
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}/`) || !fs.statSync(file).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Daily preview http://127.0.0.1:${port} · ${testMode ? 'ISOLATED TEST STORE' : 'REAL FIREBASE DAILY DATA'}`));
