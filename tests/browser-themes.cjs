/* Theme UI regression. NODE_PATH=/path/to/node_modules node tests/browser-themes.cjs */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { CARD_THEMES, renderFace } = require('../themes.js');
const base = process.env.GAME_URL || 'http://127.0.0.1:5195';
const artifacts = path.join(__dirname, '../artifacts/themes');
fs.mkdirSync(artifacts, { recursive: true });
let checks = 0;
function check(condition, label) { assert.ok(condition, label); console.log(`PASS ${++checks}: ${label}`); }

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      let api;
      Object.defineProperty(window, 'FlipSide', { get: () => api, set: value => {
        api = value;
        const Game = value.MemoryGame;
        api.MemoryGame = class extends Game { constructor() { super(); window.__game = this; } };
      } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    const choose = (group, value) => page.locator(`#customize-dialog input[name="${group}"][value="${value}"]`).check();
    const open = () => page.locator('#customize-button').click();
    const done = () => page.locator('#customize-dialog .primary-button').click();
    check(await page.locator('#current-vibe').textContent() === 'Fruits · Daydream', 'default collection and appearance are visible before play');
    await open();
    check(await page.locator('#collection-options input').count() === 6, 'all six card collections are selectable');
    check(await page.locator('#back-options input').count() === 4, 'four card-back designs are selectable');
    check(await page.locator('#board-options input').count() === 5, 'five board colors are selectable');
    check(await page.locator('#appearance-options input').count() === 3, 'three visual appearances are selectable');
    await page.screenshot({ path: path.join(artifacts, 'customizer-desktop.png') });
    await choose('collection', 'animals');
    check(await page.evaluate(() => __game.theme === 'animals' && __game.status === 'ready' && __game.cards.every(c => c.theme === 'animals')), 'collection changes preview a new deck before starting');
    check(await page.locator('#collection-caption').textContent() === 'ANIMALS COLLECTION', 'board identifies the selected collection');
    check(await page.locator('.memory-card:disabled').count() === 16, 'collection preview does not start gameplay');

    const backArt = new Set();
    for (const back of ['sparkle', 'orbit', 'quilt', 'waves']) {
      await choose('back', back);
      backArt.add(await page.locator('#board .back-art').first().innerHTML());
      check(await page.locator('html').getAttribute('data-card-back') === back, `${back} back applies immediately`);
    }
    check(backArt.size === 4, 'all card backs have genuinely different artwork');
    const colors = new Set();
    for (const color of ['paper', 'lavender', 'mint', 'peach', 'ocean']) {
      await choose('board', color);
      colors.add(await page.locator('.board-panel').evaluate(el => getComputedStyle(el).backgroundColor));
    }
    check(colors.size === 5, 'each board color produces a different visible board surface');

    const appearanceColors = new Set();
    for (const appearance of ['daydream', 'sunset', 'midnight']) {
      await choose('appearance', appearance);
      const style = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const panel = getComputedStyle(document.querySelector('.setup-panel'));
        return { bg: body.backgroundColor, text: body.color, panel: panel.backgroundColor };
      });
      appearanceColors.add(JSON.stringify(style));
      check(await page.locator('html').getAttribute('data-appearance') === appearance, `${appearance} changes the overall interface`);
    }
    check(appearanceColors.size === 3, 'visual themes change backgrounds, surfaces, and text, not just a label');
    await done();
    await page.locator('#start-button').click();
    const pair = await page.evaluate(() => __game.cards.flatMap((c, i) => c.pair === __game.cards[0].pair ? [i] : []));
    for (const index of pair) await page.locator('.memory-card').nth(index).click();
    const before = await page.evaluate(() => ({ deck: __game.cards.map(c => c.key).join(), moves: __game.moves, score: __game.score, start: __game.startedAt, matches: __game.matches }));
    await open();
    await choose('collection', 'space');
    await choose('back', 'orbit');
    await choose('board', 'mint');
    await choose('appearance', 'sunset');
    const after = await page.evaluate(() => ({ deck: __game.cards.map(c => c.key).join(), moves: __game.moves, score: __game.score, start: __game.startedAt, matches: __game.matches }));
    check(JSON.stringify(before) === JSON.stringify(after), 'changing a look preserves card order, matched cards, moves, score, and start time');
    check((await page.locator('#customize-note').textContent()).includes('unchanged') || (await page.locator('#customize-note').textContent()).includes('same game'), 'customizer explains that the current game is preserved');
    check(await page.locator('#board').getAttribute('data-collection') === 'animals', 'queued collection never swaps faces during a running game');
    await done();
    await page.locator('#restart-button').click();
    check(await page.evaluate(() => __game.theme) === 'animals', 'Restart keeps the active collection even with another collection queued');
    await page.locator('#start-button').click();
    check(await page.evaluate(() => __game.theme) === 'space', 'New game uses the queued collection');
    await page.locator('.memory-card').first().click();
    check(await page.locator('.is-flipped .card-emoji svg').count() === 1, 'Space cards render original vector illustrations');
    check((await page.locator('.is-flipped').first().getAttribute('aria-label')).includes('face up'), 'illustrated cards retain descriptive accessible labels');

    // Styling during a pending mismatch must not cancel its automatic flip-back.
    const miss = await page.evaluate(() => __game.cards.findIndex(c => c.pair !== __game.cards[0].pair));
    await page.locator('.memory-card').nth(miss).click();
    await open();
    await choose('back', 'quilt');
    await page.waitForTimeout(1150);
    check(await page.locator('.is-flipped').count() === 0 && await page.locator('#moves').textContent() === '1', 'a mismatch resolves normally while changing card backs');
    await done();

    const presets = {
      animals: ['sunset', 'quilt', 'peach'], emojis: ['daydream', 'waves', 'lavender'],
      fruits: ['daydream', 'sparkle', 'paper'], space: ['midnight', 'orbit', 'ocean'],
      nature: ['daydream', 'waves', 'mint'], technology: ['midnight', 'quilt', 'lavender'],
    };
    for (const [theme, [appearance, back, color]] of Object.entries(presets)) {
      await open();
      await choose('collection', theme);
      await choose('appearance', appearance);
      await choose('back', back);
      await choose('board', color);
      await done();
      await page.locator('input[name="difficulty"][value="hard"]').check();
      await page.locator('#start-button').click();
      const deck = await page.evaluate(() => __game.cards.map(c => ({ key: c.key, theme: c.theme, pair: c.pair })));
      check(deck.length === 36 && new Set(deck.map(c => c.key)).size === 18 && deck.every(c => c.theme === theme), `${theme}: Hard has 18 unique matching designs from only this collection`);
      const pairs = [...new Set(deck.map(c => c.pair))].map(pair => deck.flatMap((c, i) => c.pair === pair ? [i] : []));
      for (const pair of pairs.slice(0, 4)) for (const i of pair) await page.locator('.memory-card').nth(i).click();
      await page.locator('.board-panel').screenshot({ path: path.join(artifacts, `${theme}-board.png`) });
      const matchedMarkup = await page.locator('.is-matched .card-emoji').allInnerTexts();
      if (['space', 'technology'].includes(theme)) check(await page.locator('.is-matched .card-emoji svg').count() === 8, `${theme}: matching faces use distinct vector artwork`);
      else check(matchedMarkup.every(text => text.length > 0), `${theme}: matching faces display the collection’s emojis`);
      for (const pair of pairs.slice(4)) for (const i of pair) await page.locator('.memory-card').nth(i).click();
      await page.locator('#win-dialog[open]').waitFor();
      check(await page.locator('.is-matched').count() === 36 && await page.locator('#win-moves').textContent() === '18', `${theme}: complete Hard game works without broken or ambiguous pair IDs`);
      check((await page.locator('#win-description').textContent()).includes(CARD_THEMES[theme].name), `${theme}: results identify the played collection`);
      await page.locator('#win-dialog .dialog-close').click();
    }

    // Choices persist, but a previous game's face-up state must not leak into a new session.
    await page.reload();
    check(await page.locator('input[name="collection"][value="technology"]').isChecked(), 'selected collection persists after reload');
    check(await page.locator('html').getAttribute('data-card-back') === 'quilt' && await page.locator('html').getAttribute('data-board-color') === 'lavender' && await page.locator('html').getAttribute('data-appearance') === 'midnight', 'back, board color, and appearance persist independently');
    check(await page.locator('.is-flipped').count() === 0 && await page.locator('#score').textContent() === '0', 'loading preferences never resumes stale face-up cards or scores');

    // Layout coverage across every appearance and the narrowest screens.
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 500 ? 800 : 1100 });
      await open();
      for (const appearance of ['daydream', 'sunset', 'midnight']) {
        await choose('appearance', appearance);
        const dialogLayout = await page.locator('#customize-dialog').evaluate(el => {
          const bounds = el.getBoundingClientRect();
          return { fits: bounds.left >= 0 && bounds.right <= innerWidth && el.scrollWidth <= el.clientWidth,
            clipped: [...el.querySelectorAll('.custom-choice')].some(c => c.scrollWidth > c.clientWidth) };
        });
        check(dialogLayout.fits && !dialogLayout.clipped, `${width}px ${appearance}: customization options have no horizontal clipping`);
      }
      if (width === 390) {
        await page.locator('#customize-dialog').evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: path.join(artifacts, 'customizer-mobile.png') });
      }
      await done();
      await page.locator('input[name="difficulty"][value="hard"]').check();
      await page.locator('#start-button').click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: themed Hard board has no horizontal overflow`);
      if (width === 390) await page.screenshot({ path: path.join(artifacts, 'midnight-mobile.png'), fullPage: true });
    }

    // Malformed or unsupported settings should never break startup.
    for (const saved of ['not json', 'null', '[]', '{"collection":"missing","back":"constructor","appearance":"<script>","board":"#000"}']) {
      // Start a clean round first; progress persistence is tested separately.
      await page.evaluate(value => { localStorage.setItem('flipside-look-v1', value); localStorage.removeItem('flipside-progress-v1'); }, saved);
      await page.addInitScript(() => localStorage.removeItem('flipside-progress-v1'));
      await page.reload();
      check(await page.evaluate(() => __game.theme === 'fruits') && await page.locator('html').getAttribute('data-appearance') === 'daydream', 'corrupt or unsupported saved choices safely fall back to defaults');
    }
    check(errors.length === 0, `no JavaScript errors during customization (${errors.join('; ')})`);

    const blocked = await context.newPage();
    await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } }));
    await blocked.goto(base);
    await blocked.locator('#customize-button').click();
    await blocked.locator('input[name="collection"][value="technology"]').check();
    await blocked.locator('input[name="appearance"][value="midnight"]').check();
    await blocked.locator('#customize-dialog .primary-button').click();
    await blocked.locator('#start-button').click();
    check(await blocked.evaluate(() => __game.theme === 'technology') && await blocked.locator('html').getAttribute('data-appearance') === 'midnight', 'theme changes and play work when browser storage is blocked');

    const offline = await browser.newContext({ offline: true });
    const filePage = await offline.newPage();
    await filePage.goto(pathToFileURL(path.join(__dirname, '../index.html')).href);
    await filePage.locator('#customize-button').click();
    await filePage.locator('input[name="collection"][value="space"]').check();
    await filePage.locator('#customize-dialog .primary-button').click();
    await filePage.locator('#start-button').click();
    await filePage.locator('.memory-card').first().click();
    check(await filePage.locator('.is-flipped .card-emoji svg').count() === 1, 'vector-themed game is playable offline from a local HTML file');
    await offline.close();

    // Artwork contact sheets for readable visual verification of all 40 vector designs.
    const gallery = await context.newPage();
    await gallery.setViewportSize({ width: 900, height: 900 });
    for (const theme of ['space', 'technology']) {
      await gallery.setContent(`<style>body{margin:0;padding:30px;background:#f5f3fc;color:#4b3a61;font-family:system-ui}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}article{padding:15px 6px;border:1px solid #e4dcec;border-radius:14px;background:white;text-align:center;font-size:11px}svg{display:block;width:85px;height:85px;margin:0 auto 12px}</style><h1>${CARD_THEMES[theme].name} · 20 original matching designs</h1><main>${CARD_THEMES[theme].designs.map(design => `<article>${renderFace(design)}${design.name}</article>`).join('')}</main>`);
      await gallery.screenshot({ path: path.join(artifacts, `${theme}-artwork.png`), fullPage: true });
    }
    console.log(`\n${checks} theme browser checks passed. Artifacts: ${artifacts}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
