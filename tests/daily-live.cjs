/* Real production acceptance with two temporary guests. Cleans only those guests' FlipSide records. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { developerGoogleToken } = require('../scripts/provision-daily.cjs');
const base = process.env.GAME_URL || 'https://flipside-memory.vercel.app';
const project = 'nitre-d8cdd';
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/flipsideDaily/v1`;
const output = path.join(__dirname, '../artifacts/daily/live'); fs.mkdirSync(output, { recursive: true });
let checks = 0;
function check(value, label) { assert.ok(value, label); console.log(`PASS ${++checks}: ${label}`); }
function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, v]) => [key, decode(v)]));
}
async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const guests = [], contexts = [];
  const token = await developerGoogleToken();
  let config;
  const get = async url => { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`Authorized test read failed (${r.status})`); const data = await r.json(); return Object.fromEntries(Object.entries(data.fields || {}).map(([key, value]) => [key, decode(value)])); };
  try {
    config = await (await fetch(`${base}/api/daily`)).json();
    check(config.available, 'production daily service has public configuration and is available');
    async function makePlayer(viewport) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' }); contexts.push(context);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base); await page.locator('#daily-button').click();
      await page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled && (document.querySelector('#daily-player').textContent.startsWith('YOU') || document.querySelector('#daily-status').classList.contains('is-error')), null, { timeout: 60000 });
      const session = await page.evaluate(() => JSON.parse(localStorage.getItem('flipside-daily-guest-v1')));
      if (session?.uid) guests.push({ ...session, date: config.today });
      if (await page.locator('#daily-status').evaluate(el => el.classList.contains('is-error'))) throw new Error(await page.locator('#daily-status').textContent());
      return { page, context, session, errors };
    }
    const a = await makePlayer({ width: 1440, height: 1100 }); const b = await makePlayer({ width: 390, height: 844 });
    check(a.session.uid !== b.session.uid, 'two independent browsers received distinct real Firebase guest identities');
    async function start(p) { await p.page.locator('#daily-start').click(); await p.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled && document.querySelector('#daily-start').textContent.includes('Refresh'), null, { timeout: 60000 }); }
    await start(a); await start(b);
    const [savedA, savedB] = await Promise.all([get(`${root}/days/${config.today}/attempts/${a.session.uid}`), get(`${root}/days/${config.today}/attempts/${b.session.uid}`)]);
    const cards = savedA.game.cards;
    check(cards.map(c => c.key).join() === savedB.game.cards.map(c => c.key).join(), 'real Firestore attempts contain the exact same daily arrangement');
    check(await a.page.locator('#daily-board .card-emoji').allTextContents().then(text => text.every(v => !v)), 'no unopened matching pictures are sent into the production browser markup');
    async function api(p, body) { const r = await fetch(`${base}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.session.idToken}`, Origin: base }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; }
    const bad = await api(a, { action: 'finish', score: 999999, moves: 1, time: 1 });
    check(bad.status === 400, 'production refuses forged final score and time submissions');
    for (const action of ['hint', 'shuffle', 'pause']) check((await api(a, { action })).status === 400, `ranked API rejects practice-only ${action}`);
    const wrongOrigin = await fetch(`${base}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.session.idToken}`, Origin: 'https://untrusted.example' }, body: '{"action":"overview"}' });
    check(wrongOrigin.status === 403, 'production daily API rejects an untrusted origin');
    check((await fetch(`${base}/api/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer forged' }, body: '{"action":"overview"}' })).status === 401, 'production rejects forged Firebase tokens');
    for (const suffix of [`days/${config.today}`, `days/${config.today}/attempts/${a.session.uid}`, `players/${a.session.uid}`]) {
      const r = await fetch(`${root}/${suffix}`, { headers: { Authorization: `Bearer ${a.session.idToken}` } });
      check(r.status === 403, 'unchanged Firestore rules deny direct browser access to hidden daily data');
    }
    async function flip(p, index) {
      await p.page.bringToFront();
      await p.page.locator('#daily-board button').nth(index).click();
      await p.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled, null, { timeout: 60000 });
      check(!await p.page.locator('#daily-status').evaluate(el => el.classList.contains('is-error')), 'live ranked flip is confirmed without a server error');
    }
    const pairs = new Map(); cards.forEach((c, i) => pairs.set(c.pair, [...(pairs.get(c.pair) || []), i]));
    const first = [...pairs.values()][0];
    await flip(a, first[0]);
    await a.page.reload(); await a.page.locator('#daily-button').click();
    await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled && document.querySelector('#daily-player').textContent.startsWith('YOU'), null, { timeout: 60000 });
    check((await a.page.evaluate(() => JSON.parse(localStorage.getItem('flipside-daily-guest-v1')).uid)) === a.session.uid, 'reload retains the same real guest identity and server attempt');
    check(await a.page.locator('#daily-board .is-flipped').count() === 1, 'the in-progress single-card turn returns from Firestore after reload');
    await flip(a, first[1]);
    for (const pair of [...pairs.values()].slice(1)) for (const i of pair) await flip(a, i);
    await a.page.locator('#daily-finish').waitFor({ timeout: 60000 });
    check(await a.page.locator('#daily-credits').textContent() === '100' && await a.page.locator('#daily-streak').textContent() === '1', 'real completion atomically awards 100 daily credits and one streak day');
    const aEntry = await get(`${root}/days/${config.today}/entries/${a.session.uid}`);
    check(aEntry.moves === 10 && aEntry.time > 0 && aEntry.accuracy === 100, 'Firestore holds server-calculated moves, positive completion time, and accuracy');
    await api(a, { action: 'start', requestId: crypto.randomUUID() });
    await api(a, { action: 'start', requestId: crypto.randomUUID() });
    const profile = await get(`${root}/players/${a.session.uid}`);
    check(profile.credits === 100 && profile.completions === 1, 'repeated starts and result reads cannot award a duplicate daily reward');
    for (const pair of pairs.values()) for (const i of pair) await flip(b, i);
    await b.page.locator('#daily-finish').waitFor({ timeout: 60000 });
    await a.page.locator('#daily-refresh').click(); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled, null, { timeout: 60000 });
    check(await a.page.locator('#daily-leaderboard li').count() >= 2, 'shared production leaderboard contains both independent confirmed finishes');
    check(await b.page.locator('#daily-credits').textContent() === '100', 'the second real guest has their own reward balance');
    await a.page.screenshot({ path: path.join(output, 'daily-desktop.png') });
    await b.page.screenshot({ path: path.join(output, 'daily-phone.png') });
    check(a.errors.length === 0 && b.errors.length === 0, 'real desktop and phone daily flows have no JavaScript errors');
    console.log(`${checks} production daily acceptance checks passed. Temporary test guests will now be removed.`);
  } finally {
    for (const guest of guests) {
      for (const suffix of [`days/${guest.date}/attempts/${guest.uid}`, `days/${guest.date}/entries/${guest.uid}`, `players/${guest.uid}`, `rates/${guest.uid}`]) {
        const r = await fetch(`${root}/${suffix}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok && r.status !== 404) throw new Error(`Temporary FlipSide test record cleanup failed (${r.status})`);
      }
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: guest.idToken }) });
      if (!r.ok) throw new Error(`Temporary guest cleanup failed (${r.status})`);
    }
    await browser.close(); console.log('Temporary test guests and their FlipSide attempt/entry/profile/rate records removed; shared daily puzzle preserved.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
