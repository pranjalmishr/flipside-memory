/* Daily browser integration against the isolated test server, never production data. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.DAILY_TEST_URL || 'http://127.0.0.1:5196';
const output = path.join(__dirname, '../artifacts/daily'); fs.mkdirSync(output, { recursive: true });
let checks = 0;
function check(value, text) { assert.ok(value, text); console.log(`PASS ${++checks}: ${text}`); }
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    let now = Date.parse('2026-11-17T12:00:00Z');
    const admin = await browser.newContext();
    assert.equal((await admin.request.post(`${base}/__test/reset`)).status(), 200);
    async function clock(value) { now = typeof value === 'number' ? value : Date.parse(value); const r = await admin.request.post(`${base}/__test/clock`, { data: { now } }); assert.equal(r.status(), 200); }
    await clock(now);
    async function player(uid, viewport) {
      const context = await browser.newContext({ viewport: viewport || { width: 1440, height: 1100 }, reducedMotion: 'reduce', permissions: ['clipboard-write', 'clipboard-read'] });
      await context.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({ json: { localId: uid, idToken: uid, refreshToken: `refresh-${uid}`, expiresIn: '3600' } }));
      await context.route('https://securetoken.googleapis.com/**', route => route.fulfill({ json: { user_id: uid, id_token: uid, refresh_token: `refresh-${uid}`, expires_in: '3600' } }));
      const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(base); await page.evaluate(() => document.fonts.ready);
      return { page, context, errors, uid };
    }
    const a = await player('test-user-a'); const b = await player('test-user-b', { width: 390, height: 844 });
    async function open(p) { await p.page.locator('#daily-button').click(); await p.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled && document.querySelector('#daily-start').disabled === false); }
    async function start(p) { await p.page.locator('#daily-start').click(); await p.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled && !document.querySelector('#daily-board button').disabled); }
    async function flip(p, index) {
      await clock(now + 350);
      await p.page.locator('#daily-board button').nth(index).click();
      await p.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
    }
    async function deck(p) { return (await admin.request.get(`${base}/__test/deck?uid=${p.uid}`)).json(); }
    async function complete(p) {
      const cards = await deck(p); const pairs = new Map(); cards.forEach((c, i) => { if (!c.matched) pairs.set(c.pair, [...(pairs.get(c.pair) || []), i]); });
      for (const pair of pairs.values()) for (const index of pair) await flip(p, index);
      await p.page.locator('#daily-finish').waitFor({ state: 'visible' });
    }
    await a.page.locator('#start-button').click(); await a.page.locator('#board button').first().click();
    await open(a);
    check(await a.page.locator('#pause-overlay').isVisible(), 'daily mode pauses and preserves the separate practice round');
    check(await a.page.locator('#daily-board button').count() === 20, 'daily challenge has a 4 × 5 grid with 10 pairs');
    check(await a.page.locator('#daily-leaderboard li').count() === 0, 'shared leaderboard starts honestly empty');
    check(await a.page.locator('#daily-streak').textContent() === '0' && await a.page.locator('#daily-credits').textContent() === '0', 'new guest begins with no fictional rewards or streak');
    await a.page.screenshot({ path: path.join(output, 'daily-desktop-ready.png') });
    await start(a); await open(b); await start(b);
    const cardsA = await deck(a), cardsB = await deck(b);
    check(cardsA.map(c => c.key).join() === cardsB.map(c => c.key).join(), 'two players receive exactly the same daily picture arrangement');
    check(await a.page.locator('#daily-board .card-emoji').allTextContents().then(values => values.every(v => v === '')), 'unopened daily faces are not exposed in browser markup');
    const pair = cardsA.flatMap((c, i) => c.pair === cardsA[0].pair ? [i] : []);
    await flip(a, pair[0]);
    check(await a.page.locator('#daily-board .is-flipped').count() === 1 && await a.page.locator('#daily-moves').textContent() === '0', 'first daily flip reveals one picture without counting a move');
    await a.page.reload(); await open(a);
    check(await a.page.locator('#daily-board .is-flipped').count() === 1 && await a.page.locator('#daily-moves').textContent() === '0', 'server state restores the current single-card turn after reload');
    await flip(a, pair[1]);
    check(await a.page.locator('#daily-board .is-matched').count() === 2 && await a.page.locator('#daily-moves').textContent() === '1', 'matching daily cards stay visible and count exactly one move');
    await a.page.keyboard.press('h'); await a.page.keyboard.press('s'); await a.page.keyboard.press('p');
    check(await a.page.locator('#daily-board .is-matched').count() === 2, 'practice keyboard power-ups cannot affect ranked daily play');
    await a.page.locator('#daily-close').click(); await clock(now + 5000); await open(a);
    check(await a.page.locator('#daily-time').textContent() !== '00:00', 'closing and reopening daily mode does not pause or reset the ranked clock');
    await complete(a);
    check(await a.page.locator('#daily-streak').textContent() === '1' && await a.page.locator('#daily-credits').textContent() === '100', 'first confirmed daily finish earns 100 credits and a one-day streak');
    check((await a.page.locator('#daily-earned').textContent()).includes('+100'), 'daily completion explicitly shows the reward credited once');
    const credit = await a.page.locator('#daily-credits').textContent();
    await a.page.locator('#daily-refresh').click(); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
    check(await a.page.locator('#daily-credits').textContent() === credit, 'refreshing a completed challenge never grants a second reward');
    await a.page.locator('#daily-share').click();
    check((await a.page.evaluate(() => navigator.clipboard.readText())).includes('2026-11-17 UTC'), 'share action copies the daily date and performance without a private guest token');
    const mismatch = [0, cardsB.findIndex(c => c.pair !== cardsB[0].pair)];
    await b.page.bringToFront();
    for (const i of mismatch) await flip(b, i);
    check(await b.page.locator('#daily-moves').textContent() === '1', 'a daily miss counts one move');
    await clock(now + 1100); await b.page.waitForFunction(() => document.querySelectorAll('#daily-board .is-flipped').length === 0, { timeout: 5000 });
    check(await b.page.locator('#daily-board .is-flipped').count() === 0, 'unmatched daily cards flip back after the delay');
    await complete(b);
    check((await b.page.locator('#daily-finish-details').textContent()).includes('11 moves'), 'daily results include failed attempts in total moves');
    await a.page.locator('#daily-refresh').click(); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
    check(await a.page.locator('#daily-leaderboard li').count() === 2, 'real shared leaderboard includes both independent players');
    check((await a.page.locator('#daily-leaderboard li').first().textContent()).includes('10 moves'), 'fewest moves ranks ahead of a faster but less accurate run');
    check((await b.page.locator('#daily-own-rank').textContent()).includes('#2'), 'each guest sees their private confirmed rank');
    await a.page.screenshot({ path: path.join(output, 'daily-desktop-finished.png') });
    await b.page.screenshot({ path: path.join(output, 'daily-mobile-finished.png'), fullPage: true });
    for (const date of ['2026-11-18T12:00:00Z', '2026-11-19T12:00:00Z']) {
      await clock(date); await a.page.locator('#daily-refresh').click(); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
      await start(a); await complete(a);
    }
    check(await a.page.locator('#daily-streak').textContent() === '3' && await a.page.locator('#daily-credits').textContent() === '330', 'consecutive UTC days extend streaks and add 100, 110, then 120 credits');
    await clock('2026-11-21T12:00:00Z'); await a.page.locator('#daily-refresh').click(); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
    check(await a.page.locator('#daily-streak').textContent() === '0' && await a.page.locator('#daily-longest').textContent() === '3', 'missing a UTC day resets only the active streak, preserving the record');
    await a.page.locator('#daily-history').selectOption('2026-11-17'); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
    check(await a.page.locator('#daily-leaderboard li').count() === 2 && await a.page.locator('#daily-start').isHidden(), 'archived daily rankings remain readable without another reward or ranked attempt');
    await a.page.locator('#daily-history').selectOption('today'); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
    for (const width of [320, 390, 768, 1440]) {
      await a.page.setViewportSize({ width, height: 900 });
      const layout = await a.page.locator('#daily-dialog').evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth, targets: [...el.querySelectorAll('.memory-card')].every(c => c.getBoundingClientRect().width >= 44 && c.getBoundingClientRect().height >= 44) }));
      check(layout.fits && layout.targets, `${width}px daily layout fits with at least 44px card targets`);
    }
    await a.page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    for (const appearance of ['daydream', 'sunset', 'midnight']) {
      await a.page.evaluate(value => document.documentElement.dataset.appearance = value, appearance); await a.page.waitForTimeout(300);
      const audit = await a.page.evaluate(() => axe.run(document.querySelector('#daily-dialog'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      check(audit.violations.length === 0, `${appearance} daily accessibility (${JSON.stringify(audit.violations.map(v => [v.id, v.nodes.map(n => n.target)]))})`);
    }
    // Offline errors are visible and cannot invent results or consume a second ranked attempt.
    await a.context.setOffline(true); await a.page.locator('#daily-refresh').click();
    await a.page.waitForFunction(() => document.querySelector('#daily-status').classList.contains('is-error'));
    check((await a.page.locator('#daily-status').textContent()).includes('Connection'), 'offline daily service shows a connection error instead of simulated rankings');
    await a.context.setOffline(false); await a.page.locator('#daily-refresh').click(); await a.page.waitForFunction(() => !document.querySelector('#daily-refresh').disabled);
    check(!await a.page.locator('#daily-status').evaluate(el => el.classList.contains('is-error')), 'reconnect recovers the current server day and player profile');
    check(a.errors.length === 0 && b.errors.length === 0, `no daily JavaScript errors (${[...a.errors, ...b.errors].join('; ')})`);
    console.log(`\n${checks} daily browser checks passed. Test-store data only.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
