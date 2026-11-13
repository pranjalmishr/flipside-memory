/* Player features regression. Requires Playwright and a running local preview. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.GAME_URL || 'http://127.0.0.1:5195';
const artifacts = path.join(__dirname, '../artifacts/player');
fs.mkdirSync(artifacts, { recursive: true });
let count = 0;
function check(value, label) { assert.ok(value, label); console.log(`PASS ${++count}: ${label}`); }

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      let api;
      Object.defineProperty(window, 'FlipSide', { get: () => api, set: value => {
        api = value; const Game = value.MemoryGame;
        api.MemoryGame = class extends Game { constructor() { super(); window.__game = this; } };
      } });
      window.__audioContexts = []; window.__audioStarts = 0;
      const Original = window.AudioContext;
      if (Original) window.AudioContext = class extends Original {
        constructor(...args) { super(...args); window.__audioContexts.push(this); }
        createOscillator() {
          const node = super.createOscillator(); const start = node.start.bind(node);
          node.start = (...args) => { window.__audioStarts++; return start(...args); };
          return node;
        }
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    const card = i => page.locator('.memory-card').nth(i);
    const findPair = () => page.evaluate(() => {
      const first = __game.cards.findIndex(c => !c.matched);
      return __game.cards.flatMap((c, i) => c.pair === __game.cards[first].pair ? [i] : []);
    });
    async function complete() {
      const pairs = await page.evaluate(() => {
        const pairs = new Map();
        __game.cards.forEach((c, i) => { if (!c.matched) pairs.set(c.pair, [...(pairs.get(c.pair) || []), i]); });
        return [...pairs.values()];
      });
      for (const pair of pairs) for (const i of pair) if (!await card(i).evaluate(el => el.classList.contains('is-flipped'))) await card(i).click();
      await page.locator('#win-dialog[open]').waitFor();
    }

    check(await page.locator('#pause-button').isDisabled() && await page.locator('#hint-button').isDisabled() && await page.locator('#shuffle-button').isDisabled(), 'play controls are disabled before a game');
    check(await page.evaluate(() => __audioContexts.length) === 0, 'audio never autoplays or creates a context by default');
    await page.locator('#leaderboard-button').click();
    check(await page.locator('#leaderboard-empty').isVisible() && await page.locator('#leaderboard-count').textContent() === '0', 'leaderboard starts with an honest empty state, not sample scores');
    await page.locator('#leaderboard-dialog .primary-button').click();
    await page.locator('#audio-button').click();
    check(!await page.locator('#effects-enabled').isChecked() && !await page.locator('#music-enabled').isChecked(), 'sound effects and background music are independently off by default');
    await page.locator('#effects-enabled').check();
    await page.waitForFunction(() => __audioContexts[0]?.state === 'running' && __audioStarts >= 2);
    check(await page.locator('#sound-toggle').getAttribute('aria-pressed') === 'true', 'effects checkbox enables synthesized match notes and updates header control');
    await page.locator('#music-enabled').check();
    await page.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('is playing'));
    const notes = await page.evaluate(() => __audioStarts);
    await page.waitForTimeout(950);
    check(await page.evaluate(() => __audioStarts) > notes, 'background music schedules a continuing original melody');
    await page.locator('#effects-volume').evaluate(el => { el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#music-volume').evaluate(el => { el.value = '15'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    check(await page.locator('#effects-volume-label').textContent() === '30%' && await page.locator('#music-volume-label').textContent() === '15%', 'separate volume controls update immediately');
    check(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('flipside-audio-v1')); return s.effectsVolume === .3 && s.musicVolume === .15; }), 'audio volume preferences are persisted');
    await page.screenshot({ path: path.join(artifacts, 'audio-desktop.png') });
    await page.locator('#audio-dialog .primary-button').click();
    await page.locator('#start-button').click();
    await page.locator('#pause-button').click();
    const pausedAudioCount = await page.evaluate(() => __audioStarts);
    await page.waitForTimeout(1100);
    check(await page.evaluate(() => __audioStarts) === pausedAudioCount, 'pausing stops music note scheduling');
    check(await page.locator('#timer').textContent() === '00:00', 'pausing before the first flip keeps the timer unstarted');
    await page.locator('#resume-button').click();
    await page.waitForTimeout(900);
    check(await page.evaluate(() => __audioStarts) > pausedAudioCount, 'resuming brings enabled background music back');
    await page.locator('#music-toggle').click();
    await page.locator('#sound-toggle').click();
    check(await page.locator('#music-toggle').getAttribute('aria-pressed') === 'false' && await page.locator('#sound-toggle').getAttribute('aria-pressed') === 'false', 'header controls independently mute both audio channels');

    const pair = await findPair();
    await card(pair[0]).click();
    check(await page.locator('#hint-button').isDisabled() && await page.locator('#shuffle-button').isDisabled(), 'power-ups cannot interrupt an open turn');
    await page.keyboard.press('p');
    check(await page.locator('#pause-overlay').isVisible() && await page.locator('.is-flipped').count() === 0, 'pause hides all card faces behind a privacy overlay');
    check(await page.locator('.memory-card').first().getAttribute('aria-label') === 'Card 1: hidden while paused', 'paused card labels do not expose picture identities to assistive technology');
    const pausedTime = await page.locator('#timer').textContent();
    const pausedBonus = await page.locator('#bonus-preview-value').textContent();
    await page.waitForTimeout(1200);
    check(await page.locator('#timer').textContent() === pausedTime && await page.locator('#bonus-preview-value').textContent() === pausedBonus, 'pause freezes both elapsed time and the potential speed bonus');
    await page.screenshot({ path: path.join(artifacts, 'paused-desktop.png') });
    await page.locator('#resume-button').click();
    check(await card(pair[0]).evaluate(el => el.classList.contains('is-flipped')), 'resume restores an in-progress first flip');
    await card(pair[1]).click();
    check(await page.locator('#score').textContent() === '100', 'resumed turn matches and scores normally');

    const mismatch = await page.evaluate(() => {
      const first = __game.cards.findIndex(c => !c.matched);
      return [first, __game.cards.findIndex(c => !c.matched && c.pair !== __game.cards[first].pair)];
    });
    for (const i of mismatch) await card(i).click();
    await page.keyboard.press('p');
    await page.waitForTimeout(1200);
    check(await page.evaluate(() => __game.locked && __game.open.length === 2), 'pause freezes a pending mismatch delay rather than resolving it in the background');
    await page.locator('#resume-button').click();
    await page.waitForTimeout(1100);
    check(await page.evaluate(() => !__game.locked && __game.open.length === 0), 'mismatch finishes automatically after resuming');

    const beforeHint = await page.evaluate(() => ({ score: __game.score, moves: __game.moves, matches: __game.matches }));
    await page.locator('#hint-button').click();
    check(await page.locator('.is-hint.is-flipped').count() === 2 && await page.locator('#hints-left').textContent() === '2', 'a hint reveals exactly one pair and spends one of three uses');
    check(await page.evaluate(() => __game.cards[__game.hintOpen[0]].key === __game.cards[__game.hintOpen[1]].key), 'hint cards really match');
    check(JSON.stringify(beforeHint) === JSON.stringify(await page.evaluate(() => ({ score: __game.score, moves: __game.moves, matches: __game.matches }))), 'hints award no points, moves, or matched pairs');
    await page.screenshot({ path: path.join(artifacts, 'hint-desktop.png') });
    await page.waitForTimeout(1600);
    check(await page.locator('.is-hint').count() === 0 && await page.locator('.is-flipped').count() === 2, 'hint reveal closes while existing matched cards remain face up');
    const beforeShuffle = await page.evaluate(() => __game.cards.map(c => ({ id: c.id, matched: c.matched })));
    await page.locator('#shuffle-button').click();
    const afterShuffle = await page.evaluate(() => __game.cards.map(c => ({ id: c.id, matched: c.matched })));
    check(beforeShuffle.some((c, i) => c.id !== afterShuffle[i].id) && beforeShuffle.every((c, i) => !c.matched || c.id === afterShuffle[i].id), 'shuffle changes unmatched positions and leaves matched positions untouched');
    check(await page.locator('#shuffles-left').textContent() === '1' && await page.locator('#moves').textContent() === String(beforeHint.moves), 'shuffle spends one use without counting a move');
    const expectedProgress = await page.evaluate(() => ({ ids: __game.cards.map(c => c.id), score: __game.score, moves: __game.moves, hints: __game.hintsUsed, shuffles: __game.shufflesUsed }));
    await page.keyboard.press('p');
    const savedTime = await page.evaluate(() => __game.elapsed());
    await page.waitForTimeout(1100);
    await page.reload();
    check(await page.locator('#pause-overlay').isVisible() && (await page.locator('#pause-title').textContent()).includes('Welcome back'), 'reload offers the saved round paused rather than silently starting a fresh game');
    check(JSON.stringify(expectedProgress) === JSON.stringify(await page.evaluate(() => ({ ids: __game.cards.map(c => c.id), score: __game.score, moves: __game.moves, hints: __game.hintsUsed, shuffles: __game.shufflesUsed }))), 'saved game restores card positions, score, moves, and remaining power-ups exactly');
    check(await page.evaluate(() => __game.elapsed()) === savedTime, 'time spent paused or reloading never counts against the saved game');
    check(await page.locator('#effects-volume-label').textContent() === '30%' && await page.locator('#music-volume-label').textContent() === '15%', 'independent audio volumes survive reload');
    check(await page.evaluate(() => __audioContexts.length) === 0, 'restoring a game does not autoplay audio');
    await page.locator('#resume-button').click();
    check(await page.locator('.is-matched.is-flipped').count() === 2, 'restored matched pair reappears on resume');

    // Native visibility events call this same handler; emulate the hidden property deterministically.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(await page.evaluate(() => __game.status) === 'paused', 'hidden-tab event automatically pauses an active game');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    check(await page.evaluate(() => __game.status) === 'paused', 'returning to the tab waits for an explicit resume');
    await page.locator('#resume-button').click();

    // Spend all remaining uses; disabled controls prevent extra power-ups.
    for (let i = 0; i < 2; i++) { await page.locator('#hint-button').click(); await page.waitForTimeout(1600); }
    check(await page.locator('#hint-button').isDisabled() && await page.locator('#hints-left').textContent() === '0', 'hint button disables after all three uses');
    await page.locator('#shuffle-button').click();
    check(await page.locator('#shuffle-button').isDisabled() && await page.locator('#shuffles-left').textContent() === '0', 'shuffle button disables after both uses');
    await complete();
    check((await page.locator('#win-assistance').textContent()).includes('Assisted') && (await page.locator('#win-assistance').textContent()).includes('3 hints'), 'final results disclose assisted play and power-up counts');
    check(await page.evaluate(() => localStorage.getItem('flipside-progress-v1')) === null, 'winning clears the active saved game');
    check(await page.evaluate(() => JSON.parse(localStorage.getItem('flipside-runs-v1')).records.length) === 1, 'completion saves exactly one leaderboard result');
    await page.locator('#win-leaderboard').click();
    check(await page.locator('.leaderboard-row').count() === 1 && (await page.locator('.leaderboard-row').textContent()).includes('Assisted'), 'personal leaderboard displays the completed assisted result');
    await page.locator('#leaderboard-mode').selectOption('solo');
    check(await page.locator('#leaderboard-empty').isVisible(), 'unassisted filter excludes power-up runs');
    await page.locator('#leaderboard-mode').selectOption('assisted');
    check(await page.locator('.leaderboard-row').count() === 1, 'assisted filter includes power-up runs');
    await page.locator('#leaderboard-level').selectOption('medium');
    check(await page.locator('#leaderboard-count').textContent() === '0', 'leaderboard separates difficulty levels');
    await page.locator('#leaderboard-dialog .primary-button').click();
    await page.locator('#start-button').click();
    check(await page.locator('#hints-left').textContent() === '3' && await page.locator('#shuffles-left').textContent() === '2', 'new round resets both power-up allowances');
    await complete();
    const finalScore = await page.locator('#win-score').textContent();
    await page.locator('#win-leaderboard').click();
    check(await page.locator('.leaderboard-row').count() === 2, 'multiple personal performances are kept, not just one best time');
    check(await page.locator('.leaderboard-score').first().innerText() === `${finalScore}\npoints`, 'higher score ranks first');
    check((await page.locator('#best-score').textContent()).includes(finalScore), 'sidebar tracks the best score as well as the fastest time');
    await page.screenshot({ path: path.join(artifacts, 'leaderboard-desktop.png') });
    await page.locator('#leaderboard-dialog .primary-button').click();
    await page.reload();
    await page.locator('#leaderboard-button').click();
    check(await page.locator('.leaderboard-row').count() === 2, 'leaderboard persists after reload without duplicate results');
    check(await page.locator('#leaderboard-best').textContent() === finalScore, 'best score survives reload');

    // Responsive leaderboard, audio, and pause UI at phone and tablet widths.
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 800 });
      check(await page.locator('#leaderboard-dialog').evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth), `${width}px: leaderboard has no horizontal clipping`);
      if (width === 390) await page.screenshot({ path: path.join(artifacts, 'leaderboard-mobile.png') });
    }
    await page.locator('#leaderboard-dialog .primary-button').click();
    await page.setViewportSize({ width: 390, height: 850 });
    await page.locator('#start-button').click();
    await page.locator('#pause-button').click();
    await page.screenshot({ path: path.join(artifacts, 'paused-mobile.png'), fullPage: true });
    await page.locator('#audio-button').click();
    check(await page.locator('#audio-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), 'phone audio controls do not clip horizontally');
    await page.screenshot({ path: path.join(artifacts, 'audio-mobile.png') });
    await page.locator('#audio-dialog .primary-button').click();
    await page.locator('#leaderboard-button').click();
    await page.locator('#leaderboard-dialog .primary-button').click();
    check(await page.evaluate(() => __game.status) === 'paused', 'opening and closing the leaderboard never silently resumes a paused game');
    check(errors.length === 0, `no browser JavaScript errors (${errors.join('; ')})`);

    const failed = await context.newPage();
    await failed.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } });
      window.AudioContext = undefined; window.webkitAudioContext = undefined;
    });
    await failed.goto(base);
    await failed.locator('#music-toggle').click();
    await failed.locator('#audio-button').click();
    check((await failed.locator('#audio-status').textContent()).includes('unavailable'), 'unsupported audio reports the limitation without crashing');
    await failed.locator('#audio-dialog .primary-button').click();
    await failed.locator('#start-button').click();
    await failed.locator('#hint-button').click();
    check((await failed.locator('#save-status').textContent()).includes('unavailable') && await failed.locator('.is-hint').count() === 2, 'blocked storage clearly reports unsaved progress while play and hints still work');

    const quota = await context.newPage();
    await quota.addInitScript(() => {
      localStorage.removeItem('flipside-progress-v1');
      Storage.prototype.setItem = () => { throw new DOMException('Storage is full', 'QuotaExceededError'); };
    });
    await quota.goto(base);
    const priorRecords = await quota.evaluate(() => JSON.parse(localStorage.getItem('flipside-runs-v1')).records.filter(r => r.level === 'easy').length);
    await quota.locator('#start-button').click();
    const quotaPairs = await quota.evaluate(() => {
      const pairs = new Map(); __game.cards.forEach((c, i) => pairs.set(c.pair, [...(pairs.get(c.pair) || []), i])); return [...pairs.values()];
    });
    for (const pair of quotaPairs) for (const i of pair) await quota.locator('.memory-card').nth(i).click();
    await quota.locator('#win-dialog[open]').waitFor();
    check((await quota.locator('#save-status').textContent()).includes('unavailable'), 'quota errors after a win never falsely claim the new score was saved');
    await quota.locator('#win-leaderboard').click();
    check(await quota.locator('.leaderboard-row').count() === priorRecords + 1, 'unsaved scores remain in the current-tab leaderboard instead of reverting to stale disk records');

    const corrupt = await context.newPage();
    await corrupt.addInitScript(() => { localStorage.setItem('flipside-progress-v1', '{"version":1,"cards":"bad"}'); localStorage.setItem('flipside-runs-v1', '{"version":1,"records":[{"score":999999}]}'); });
    await corrupt.goto(base);
    check(await corrupt.evaluate(() => __game.status === 'ready') && await corrupt.locator('#score').textContent() === '0', 'invalid progress is rejected safely rather than restoring a corrupt board');
    await corrupt.locator('#leaderboard-button').click();
    check(await corrupt.locator('#leaderboard-empty').isVisible(), 'invalid stored leaderboard entries are ignored');
    console.log(`\n${count} player browser checks passed. Artifacts: ${artifacts}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
