/* Cross-engine release, responsive, race-condition, and accessibility checks. */
const { chromium, firefox, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.GAME_URL || 'http://127.0.0.1:5195';
const output = path.join(__dirname, '../artifacts/release');
fs.mkdirSync(output, { recursive: true });
let checks = 0;
function check(value, label) { assert.ok(value, label); console.log(`PASS ${++checks}: ${label}`); }
const engines = { chromium, firefox, webkit };

(async () => {
  for (const name of (process.env.RELEASE_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    const browser = await engines[name].launch(name === 'chromium' ? { channel: process.env.BROWSER_CHANNEL || 'chrome' } : {});
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', bypassCSP: true });
      await context.addInitScript(() => {
        let api;
        Object.defineProperty(window, 'FlipSide', { get: () => api, set: value => {
          api = value; const Game = value.MemoryGame;
          value.MemoryGame = class extends Game { constructor() { super(); window.__game = this; } };
        } });
      });
      const page = await context.newPage();
      const errors = [], external = new Set();
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (!request.url().startsWith(new URL(base).origin)) external.add(request.url()); });
      await page.goto(base);
      await page.evaluate(() => document.fonts.ready);
      check(await page.evaluate(() => document.fonts.check('12px "DM Sans"') && document.fonts.check('12px Manrope')), `${name}: local fonts are loaded`);
      check(external.size === 0, `${name}: no external font, image, or runtime requests`);
      await page.screenshot({ path: path.join(output, `${name}-phone-ready.png`), fullPage: true });
      for (const [width, height] of [[320, 740], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 1000]]) {
        await page.setViewportSize({ width, height });
        for (const [level, cards, columns] of [['easy', 16, 4], ['medium', 20, 5], ['hard', 36, 6]]) {
          await page.locator(`input[name="difficulty"][value="${level}"]`).check();
          await page.locator('#start-button').click();
          const layout = await page.evaluate(() => {
            const grid = document.querySelector('#board');
            const cards = [...grid.children].map(c => c.getBoundingClientRect());
            return { count: cards.length, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
              overflow: document.documentElement.scrollWidth > innerWidth,
              small: cards.some(c => c.width < 44 || c.height < 44),
              crowd: cards.some((c, i) => c.right > grid.getBoundingClientRect().right + .5 || (i && Math.abs(c.y - cards[i - 1].y) < 1 && c.left - cards[i - 1].right < 3)),
              clipped: [...document.querySelectorAll('.stat-card')].some(c => c.scrollWidth > c.clientWidth),
              desktopFits: innerWidth < 1001 || grid.getBoundingClientRect().bottom <= innerHeight + 1,
              boardVisible: document.querySelector('.play-area').getBoundingClientRect().top >= -1 && document.querySelector('.play-area').getBoundingClientRect().top < innerHeight / 2 };
          });
          check(layout.count === cards && layout.columns === columns && !layout.overflow && !layout.small && !layout.crowd && !layout.clipped && layout.desktopFits, `${name} ${width}px ${level}: grid, card targets, spacing, and stats fit (${JSON.stringify(layout)})`);
          if (width <= 760) check(layout.boardVisible, `${name} ${width}px ${level}: starting a round brings play into view`);
          if (width === 390 && level === 'easy') await page.screenshot({ path: path.join(output, `${name}-phone-playing.png`) });
          if (width === 1440 && level === 'easy') await page.screenshot({ path: path.join(output, `${name}-desktop.png`), fullPage: true });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const targets = await page.locator('.site-header button, .game-controls button, #restart-button').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return [n.id, r.width, r.height]; }));
      check(targets.every(([, w, h]) => w >= 44 && h >= 44), `${name}: primary phone controls have 44px touch targets (${JSON.stringify(targets)})`);
      await page.locator('#start-button').click();
      await page.evaluate(() => { __game.startedAt = Date.now() - 6000000; });
      await page.locator('#pause-button').click();
      check(await page.locator('.stat-card').last().evaluate(el => el.scrollWidth <= el.clientWidth), `${name}: long-running timers still fit on a phone`);
      await page.locator('#restart-button').click();
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', repeat: true, bubbles: true })));
      check(await page.evaluate(() => __game.status === 'playing'), `${name}: holding a shortcut cannot repeatedly pause or spend power-ups`);

      for (const [level, pairs] of [['easy', 8], ['medium', 10], ['hard', 18]]) {
        await page.locator(`input[name="difficulty"][value="${level}"]`).check();
        await page.locator('#start-button').click();
        await page.locator('#hint-button').click();
        await page.locator('#pause-button').click();
        const snapshot = await page.evaluate(() => ({ id: __game.id, time: __game.elapsed(), hints: __game.hintsUsed }));
        await page.reload();
        check(await page.evaluate(() => __game.status === 'paused' && __game.hintsUsed === 1 && __game.open.length === 0 && __game.hintOpen.length === 0), `${name} ${level}: a pending hint restores paused and remains spent`);
        check(await page.evaluate(s => __game.id === s.id && __game.elapsed() === s.time, snapshot), `${name} ${level}: save/restore preserves identity and exact elapsed time`);
        await page.locator('#resume-button').click();
        await page.locator('#shuffle-button').click();
        const pair = await page.evaluate(() => __game.cards.flatMap((c, i) => c.pair === __game.cards[0].pair ? [i] : []));
        for (const i of pair) await page.locator('.memory-card').nth(i).click();
        check(await page.locator('#score').textContent() === '100' && await page.locator('#moves').textContent() === '1', `${name} ${level}: a matched pair earns points and one move after recovery`);
        const unmatched = await page.evaluate(() => __game.cards.findIndex(c => !c.matched));
        await page.locator('.memory-card').nth(unmatched).focus();
        await page.keyboard.press('s');
        check(await page.evaluate(() => document.activeElement?.classList.contains('memory-card') && __game.shufflesUsed === 2), `${name} ${level}: keyboard shuffle preserves focus and respects its limit`);
        const remaining = await page.evaluate(() => {
          const result = new Map(); __game.cards.forEach((c, i) => { if (!c.matched) result.set(c.pair, [...(result.get(c.pair) || []), i]); }); return [...result.values()].flat();
        });
        const race = name === 'chromium' && level === 'hard';
        for (let j = 0; j < remaining.length; j++) {
          if (race && j === remaining.length - 1) {
            await page.evaluate(i => { document.querySelectorAll('.memory-card')[i].click(); document.querySelector('#leaderboard-button').click(); }, remaining[j]);
          } else await page.locator('.memory-card').nth(remaining[j]).click();
        }
        if (race) {
          await page.waitForTimeout(250);
          check(await page.locator('#leaderboard-dialog').evaluate(el => el.open) && !await page.locator('#win-dialog').evaluate(el => el.open), 'late victory animation never closes a leaderboard the player already opened');
          await page.locator('#leaderboard-dialog .primary-button').click();
        } else {
          await page.locator('#win-dialog[open]').waitFor();
          await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
          const winAxe = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          check(winAxe.violations.length === 0, `${name} ${level}: results accessibility (${JSON.stringify(winAxe.violations.map(v => [v.id, v.nodes.map(n => n.target)]))})`);
          await page.locator('#win-dialog .dialog-close').click();
        }
        const final = await page.evaluate(() => ({ score: __game.score, bonus: __game.speedBonus, moves: __game.moves, matched: __game.matches, status: __game.status, time: __game.elapsed() }));
        check(final.status === 'won' && final.matched === pairs && final.moves === pairs && final.score === pairs * 100 + final.bonus, `${name} ${level}: complete game has correct score, moves, and matches`);
        check(await page.evaluate(() => localStorage.getItem('flipside-progress-v1')) === null, `${name} ${level}: victory clears the saved active game`);
      }

      // Check all skins, with every dialog, using the actual rendered app.
      await page.reload();
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      for (const appearance of ['daydream', 'sunset', 'midnight']) {
        await page.locator('#customize-button').click();
        await page.locator(`input[name="appearance"][value="${appearance}"]`).check();
        await page.locator('#customize-dialog .primary-button').click();
        for (const modal of [null, 'customize', 'help', 'audio', 'leaderboard']) {
          if (modal) await page.locator(`#${modal === 'customize' ? 'customize' : modal === 'help' ? 'help' : modal === 'audio' ? 'audio' : 'leaderboard'}-button`).click();
          const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          check(audit.violations.length === 0, `${name} ${appearance} ${modal || 'page'}: automated accessibility (${JSON.stringify(audit.violations.map(v => [v.id, v.nodes.map(n => n.target)]))})`);
          if (modal) {
            check(await page.locator(`#${modal}-dialog`).evaluate(el => el.scrollWidth <= el.clientWidth), `${name} ${appearance} ${modal}: dialog fits phone width`);
            if (name === 'chromium' && appearance === 'midnight' && ['audio', 'leaderboard'].includes(modal)) await page.screenshot({ path: path.join(output, `midnight-${modal}.png`) });
            await page.locator(`#${modal}-dialog .primary-button`).click();
          }
        }
      }
      check(errors.length === 0, `${name}: no browser JavaScript errors (${errors.join('; ')})`);
      check(external.size === 0, `${name}: all runtime resources remain local`);
      if (process.env.PRODUCTION_CHECKS === '1' && name === 'chromium') {
        const response = await context.request.get(base);
        check(response.status() === 200 && response.headers()['content-security-policy']?.includes("script-src 'self'"), 'production has a restrictive content security policy');
        check(response.headers()['x-content-type-options'] === 'nosniff', 'production sends MIME-sniffing protection');
        for (const file of ['/README.md', '/package.json', '/tests/browser.cjs', '/.git/config']) {
          check((await context.request.get(new URL(file, base).href)).status() === 404, `production does not publish ${file}`);
        }
      }
    } finally { await browser.close(); }
  }
  console.log(`\n${checks} release browser checks passed. Screenshots: ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
