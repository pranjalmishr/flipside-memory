/* Run with: NODE_PATH=/path/to/node_modules node tests/browser.cjs
   Only test tooling needs Playwright; the game has no runtime dependencies. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = process.env.GAME_URL || 'http://127.0.0.1:5195';
const artifacts = path.join(__dirname, '../artifacts');
fs.mkdirSync(artifacts, { recursive: true });
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; console.log(`PASS ${checks}: ${message}`); }

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Observe rules state for deterministic test inputs without exposing it in the shipped UI.
    await page.addInitScript(() => {
      let api;
      Object.defineProperty(window, 'FlipSide', { get: () => api, set: value => {
        api = value;
        const Game = api.MemoryGame;
        api.MemoryGame = class extends Game {
          constructor() { super(); window.__game = this; }
        };
      } });
    });
    await page.goto(base);
    await page.locator('.memory-card').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    check(await page.locator('.memory-card').count() === 16, 'initial Easy board has 16 hidden cards');
    check(await page.locator('.memory-card:disabled').count() === 16, 'board requires starting after difficulty selection');
    check(await page.locator('.card-emoji').allTextContents().then(x => x.every(t => t === '')), 'hidden symbols are not in initial markup');
    check(await page.locator('#accuracy').textContent() === '—', 'accuracy is not fabricated before a completed move');
    check(await page.locator('#bonus-preview-value').textContent() === '+300', 'Easy previews a maximum 300 point completion bonus');
    await page.screenshot({ path: path.join(artifacts, 'desktop-ready.png'), fullPage: true });
    await page.locator('#start-button').click();
    check(await page.locator('#timer').textContent() === '00:00', 'timer is zero after starting');
    await page.waitForTimeout(1100);
    check(await page.locator('#timer').textContent() === '00:00', 'timer waits for the first flip');
    await page.locator('.memory-card').nth(0).click();
    await page.locator('.memory-card').nth(0).click({ force: true });
    check(await page.locator('.is-flipped').count() === 1, 'double clicking cannot flip a card twice');
    check(await page.locator('#moves').textContent() === '0', 'one card does not count as a move');
    const notMatch = await page.evaluate(() => __game.cards.findIndex(c => c.pair !== __game.cards[0].pair));
    await page.locator('.memory-card').nth(notMatch).click();
    await page.locator('.memory-card').nth((notMatch + 1) % 16).click({ force: true });
    check(await page.locator('.is-flipped').count() === 2, 'a third card is blocked during mismatch');
    check(await page.locator('#moves').textContent() === '1', 'two-card attempt counts as one move');
    check(await page.locator('#accuracy').textContent() === '0%', 'first mismatch displays zero percent accuracy');
    await page.waitForTimeout(1200);
    check(await page.locator('.is-flipped').count() === 0, 'unmatched cards automatically flip back');
    check(await page.locator('#timer').textContent() !== '00:00', 'timer advances after first flip');
    const pairIndices = await page.evaluate(() => __game.cards.flatMap((c, i) => c.pair === __game.cards[0].pair ? [i] : []));
    for (const i of pairIndices) await page.locator('.memory-card').nth(i).click();
    check(await page.locator('.is-matched').count() === 2, 'a matching pair stays face up');
    check(await page.locator('#score').textContent() === '100', 'a match earns 100 points');
    check(await page.locator('#pairs-count').textContent() === '1 / 8', 'pair count updates');
    check(await page.locator('#accuracy').textContent() === '50%', 'one match in two moves displays 50 percent accuracy');
    check(await page.locator('#bonus-preview-label').textContent() === 'Potential finish bonus', 'speed points are clearly a preview until completion');
    await page.waitForTimeout(1200);
    check(await page.locator('.is-matched').count() === 2, 'matched cards remain visible after delay');
    await page.screenshot({ path: path.join(artifacts, 'desktop-playing.png'), fullPage: true });
    const oldDeck = await page.evaluate(() => __game.cards.map(c => c.id).join());
    await page.locator('#restart-button').click();
    check(await page.locator('#score').textContent() === '0' && await page.locator('#moves').textContent() === '0' && await page.locator('#timer').textContent() === '00:00', 'restart resets score, moves, and time');
    check(await page.locator('.is-flipped').count() === 0, 'restart hides all cards');
    check(await page.evaluate(() => __game.cards.map(c => c.id).join()) !== oldDeck, 'restart shuffles positions');
    check(await page.locator('#accuracy').textContent() === '—' && await page.locator('#bonus-preview-value').textContent() === '+300', 'restart clears accuracy and resets potential bonus');

    // Restart while a delayed mismatch is pending must not affect a new first flip.
    await page.locator('.memory-card').nth(0).click();
    const secondMismatch = await page.evaluate(() => __game.cards.findIndex(c => c.pair !== __game.cards[0].pair));
    await page.locator('.memory-card').nth(secondMismatch).click();
    await page.locator('#restart-button').click();
    await page.locator('.memory-card').nth(0).click();
    await page.waitForTimeout(1150);
    check(await page.locator('.is-flipped').count() === 1, 'restart cancels stale mismatch callback');

    await page.locator('input[value="hard"]').check();
    check(await page.locator('.memory-card').count() === 16, 'difficulty selection does not interrupt an active game');
    await page.locator('#start-button').click();
    check(await page.locator('.memory-card').count() === 36, 'Hard starts with 36 cards');
    check(await page.locator('#board').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length) === 6, 'Hard uses six columns');
    await page.locator('#restart-button').click();
    await page.locator('.memory-card').first().focus();
    await page.keyboard.press('ArrowRight');
    check(await page.locator('.memory-card').nth(1).evaluate(el => el === document.activeElement), 'arrow key moves focus');
    await page.keyboard.press('Enter');
    check(await page.locator('.is-flipped').count() === 1, 'Enter flips a card');
    await page.keyboard.press('ArrowDown');
    check(await page.locator('.memory-card').nth(7).evaluate(el => el === document.activeElement), 'ArrowDown moves one full row');
    await page.locator('#help-button').click();
    check(await page.locator('#help-dialog').evaluate(el => el.open), 'instructions dialog opens');
    await page.keyboard.press('Escape');
    check(!await page.locator('#help-dialog').evaluate(el => el.open), 'Escape closes instructions');
    await page.locator('#sound-toggle').click();
    check(await page.locator('#sound-toggle').getAttribute('aria-pressed') === 'true', 'sound toggle works');
    await page.locator('#sound-toggle').click();

    for (const [level, pairs, columns] of [['easy', 8, 4], ['medium', 10, 5], ['hard', 18, 6]]) {
      await page.locator(`input[value="${level}"]`).check();
      await page.locator('#start-button').click();
      check(await page.locator('.memory-card').count() === pairs * 2, `${level}: correct card count`);
      check(await page.locator('#board').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length) === columns, `${level}: correct column count`);
      const pairsToFind = await page.evaluate(() => {
        const pairs = new Map();
        __game.cards.forEach((c, i) => pairs.set(c.pair, [...(pairs.get(c.pair) || []), i]));
        return [...pairs.values()];
      });
      for (const pair of pairsToFind) for (const i of pair) await page.locator('.memory-card').nth(i).click();
      await page.locator('#win-dialog[open]').waitFor();
      check(await page.locator('.is-matched').count() === pairs * 2, `${level}: every matching card remains visible`);
      const expectedBonus = await page.evaluate(() => Math.max(0, Math.floor((FlipSide.LEVELS[__game.level].targetSeconds * 1000 - __game.elapsed()) / 1000)) * 5);
      check(await page.locator('#score').textContent() === (pairs * 100 + expectedBonus).toLocaleString(), `${level}: final score includes the exact speed bonus`);
      check(await page.locator('#win-score').textContent() === await page.locator('#score').textContent(), `${level}: results score matches the scoreboard`);
      check(await page.locator('#win-bonus').textContent() === `+${expectedBonus.toLocaleString()}`, `${level}: results show a separate speed bonus`);
      check(await page.locator('#win-pair-points').textContent() === (pairs * 100).toLocaleString(), `${level}: results show matching-pair points`);
      check(await page.locator('#win-accuracy').textContent() === '100%' && await page.locator('#accuracy').textContent() === '100%', `${level}: perfect game has 100 percent accuracy`);
      check(await page.locator('#win-stars .is-earned').count() === 3 && await page.locator('#win-stars').getAttribute('aria-label') === '3 out of 3 stars', `${level}: fast accurate game earns three accessible stars`);
      check(await page.locator('#moves').textContent() === String(pairs), `${level}: correct final move count`);
      const finalTime = await page.locator('#timer').textContent();
      await page.waitForTimeout(1100);
      check(await page.locator('#timer').textContent() === finalTime, `${level}: timer stops at victory`);
      check(await page.locator('#win-bonus').textContent() === `+${expectedBonus.toLocaleString()}`, `${level}: completion bonus freezes after victory`);
      check(await page.evaluate(key => !!JSON.parse(localStorage.getItem('flipside-best-v1'))[key], level), `${level}: best result saved locally`);
      if (level === 'easy') {
        await page.screenshot({ path: path.join(artifacts, 'victory.png') });
        await page.setViewportSize({ width: 320, height: 720 });
        check(await page.locator('#win-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), 'results fit the smallest phone without horizontal clipping');
        await page.screenshot({ path: path.join(artifacts, 'rewards-mobile.png') });
        await page.locator('#play-again').scrollIntoViewIfNeeded();
        check(await page.locator('#play-again').isVisible(), 'phone results allow scrolling to the play-again action');
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
      await page.locator('#win-dialog .dialog-close').click();
    }

    // Three deliberate misses produce a two-star result, not a fixed celebration.
    await page.locator('input[value="easy"]').check();
    await page.locator('#start-button').click();
    const misses = await page.evaluate(() => [0, __game.cards.findIndex(c => c.pair !== __game.cards[0].pair)]);
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const i of misses) await page.locator('.memory-card').nth(i).click();
      await page.waitForTimeout(1100);
    }
    async function finishBoard() {
      const pairs = await page.evaluate(() => {
        const pairs = new Map();
        __game.cards.forEach((c, i) => { if (!c.matched) pairs.set(c.pair, [...(pairs.get(c.pair) || []), i]); });
        return [...pairs.values()];
      });
      for (const pair of pairs) for (const i of pair) {
        if (!await page.locator('.memory-card').nth(i).evaluate(el => el.classList.contains('is-flipped'))) await page.locator('.memory-card').nth(i).click();
      }
      await page.locator('#win-dialog[open]').waitFor();
    }
    await finishBoard();
    check(await page.locator('#win-moves').textContent() === '11' && await page.locator('#win-accuracy').textContent() === '72.7%', 'results include misses in move count and fractional accuracy');
    check(await page.locator('#win-stars .is-earned').count() === 2, 'lower accuracy earns two stars rather than three');
    await page.screenshot({ path: path.join(artifacts, 'rewards-two-stars.png') });
    await page.locator('#play-again').click();
    check(await page.locator('#score').textContent() === '0' && await page.locator('#accuracy').textContent() === '—', 'play again clears prior rewards and accuracy');
    await page.locator('.memory-card').first().click();
    // Advance only the test's start timestamp to exercise a long completion without a two-minute wait.
    await page.evaluate(() => { __game.startedAt -= 125000; });
    await finishBoard();
    check(await page.locator('#win-stars .is-earned').count() === 1, 'completion beyond twice the target receives one star');
    check(await page.locator('#win-bonus').textContent() === '+0' && await page.locator('#win-score').textContent() === '800', 'slow finish has no negative bonus or lost pair points');
    check(await page.locator('#win-accuracy').textContent() === '100%', 'time penalty does not alter accuracy');
    await page.locator('#win-dialog .dialog-close').click();

    // Layout and touch target checks, including the smallest supported phone.
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const level of ['easy', 'medium', 'hard']) {
        await page.locator(`input[value="${level}"]`).check();
        await page.locator('#start-button').click();
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          tooSmall: [...document.querySelectorAll('.memory-card')].some(c => { const b = c.getBoundingClientRect(); return b.width < 44 || b.height < 44; }),
          clippedStat: [...document.querySelectorAll('.stat-card')].some(e => e.scrollWidth > e.clientWidth),
          crowdedCards: (() => {
            const cards = [...document.querySelectorAll('.memory-card')].map(e => e.getBoundingClientRect());
            const grid = document.querySelector('#board').getBoundingClientRect();
            return cards.some((c, i) => c.right > grid.right + .5 || (i && Math.abs(c.y - cards[i - 1].y) < 1 && c.x - cards[i - 1].right < 3));
          })(),
        }));
        check(!layout.overflow && !layout.tooSmall && !layout.clippedStat && !layout.crowdedCards, `${width}px ${level}: no clipping, no crowding, and card targets at least 44px (${JSON.stringify(layout)})`);
        if (width === 390 && level === 'easy') await page.screenshot({ path: path.join(artifacts, 'mobile-easy.png'), fullPage: true });
        if (width === 320 && level === 'hard') await page.screenshot({ path: path.join(artifacts, 'mobile-hard.png'), fullPage: true });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check(await page.locator('.card-inner').first().evaluate(el => getComputedStyle(el).transitionDuration) === '0s', 'reduced motion disables flip transitions');
    await page.reload();
    check((await page.locator('#best-time').textContent()).includes('moves'), 'best result survives reload');
    check(errors.length === 0, `no browser JavaScript errors (${errors.join('; ')})`);

    const privatePage = await context.newPage();
    await privatePage.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    });
    await privatePage.goto(base);
    await privatePage.locator('#start-button').click();
    await privatePage.locator('.memory-card').first().click();
    check(await privatePage.locator('.is-flipped').count() === 1, 'game works with local storage blocked');

    const offline = await browser.newContext({ offline: true });
    const filePage = await offline.newPage();
    await filePage.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
    await filePage.locator('#start-button').click();
    await filePage.locator('.memory-card').first().click();
    check(await filePage.locator('.is-flipped').count() === 1, 'local HTML file is playable offline without a server');
    await offline.close();
    console.log(`\n${checks} browser checks passed. Screenshots: ${artifacts}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
