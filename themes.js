/* Curated card artwork and appearance choices. No network assets required. */
(function (root) {
  'use strict';
  const emojiCards = entries => entries.map(([emoji, name], index) => Object.freeze({
    key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), emoji, name,
  }));
  const svg = (body, color = '#8061c4') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const illustrated = (key, name, body, color) => Object.freeze({ key, name, emoji: '', art: svg(body, color) });
  const collection = (name, icon, description, designs) => Object.freeze({ name, icon, description, designs: Object.freeze(designs) });

  const CARD_THEMES = Object.freeze({
    animals: collection('Animals', '🦊', 'A wildly good brain break.', emojiCards([
      ['🦊', 'Fox'], ['🐼', 'Panda'], ['🐸', 'Frog'], ['🦁', 'Lion'], ['🐨', 'Koala'],
      ['🐯', 'Tiger'], ['🐷', 'Pig'], ['🐵', 'Monkey'], ['🐰', 'Rabbit'], ['🐶', 'Dog'],
      ['🐱', 'Cat'], ['🐮', 'Cow'], ['🐙', 'Octopus'], ['🐳', 'Whale'], ['🦋', 'Butterfly'],
      ['🐢', 'Turtle'], ['🦉', 'Owl'], ['🦄', 'Unicorn'], ['🦀', 'Crab'], ['🦜', 'Parrot'],
    ])),
    emojis: collection('Emojis', '🥳', 'A whole mood, in matching pairs.', emojiCards([
      ['😀', 'Grinning face'], ['😍', 'Heart eyes'], ['😎', 'Sunglasses face'], ['🥳', 'Party face'],
      ['🤩', 'Star eyes'], ['🤖', 'Robot face'], ['👻', 'Ghost'], ['🤡', 'Clown face'],
      ['🥶', 'Freezing face'], ['🥵', 'Hot face'], ['🤠', 'Cowboy face'], ['🥸', 'Disguised face'],
      ['😴', 'Sleeping face'], ['😭', 'Crying face'], ['😡', 'Angry face'], ['🤔', 'Thinking face'],
      ['🤐', 'Zipper mouth'], ['🤢', 'Nauseated face'], ['🤯', 'Mind blown'], ['🥺', 'Pleading face'],
    ])),
    fruits: collection('Fruits', '🍓', 'Fresh picks. Sweet little matches.', emojiCards([
      ['🍓', 'Strawberry'], ['🍋', 'Lemon'], ['🍒', 'Cherries'], ['🍉', 'Watermelon'],
      ['🍊', 'Orange'], ['🍍', 'Pineapple'], ['🍇', 'Grapes'], ['🥝', 'Kiwi'],
      ['🍎', 'Red apple'], ['🍐', 'Pear'], ['🍑', 'Peach'], ['🥭', 'Mango'],
      ['🍌', 'Banana'], ['🥥', 'Coconut'], ['🫐', 'Blueberries'], ['🍈', 'Melon'],
      ['🥑', 'Avocado'], ['🍅', 'Tomato'], ['🫒', 'Olives'], ['🌶️', 'Chili pepper'],
    ])),
    space: collection('Space', '🪐', 'One small flip for your mind.', [
      illustrated('rocket', 'Rocket', '<path fill="#f7d5bf" d="M25 37c-2-13 4-24 15-29 5 11 4 23-6 31Z"/><circle cx="34" cy="23" r="4" fill="#fff"/><path d="m25 28-9 8 10 1m10-1 1 12-7-8m-7 2-6 10 10-5"/>', '#bd745b'),
      illustrated('saturn', 'Saturn', '<circle cx="32" cy="30" r="15" fill="#f9df9c"/><ellipse cx="32" cy="32" rx="27" ry="7" transform="rotate(-24 32 32)"/><path d="m25 21 13 3m-17 4 19 4"/>', '#b78d42'),
      illustrated('earth', 'Earth', '<circle cx="32" cy="32" r="22" fill="#d1eafa"/><path fill="#9cc6a8" d="m17 17 10-5 7 8-6 7-10-2-6 9m36-8-12 3-1 8 8 4-1 11m-19-7 3 9 6-9-3-7-7-2Z"/>', '#598ba3'),
      illustrated('sun', 'Sun', '<circle cx="32" cy="32" r="14" fill="#f9d77b"/><path d="M32 4v7m0 42v7M4 32h7m42 0h7M12 12l5 5m30 30 5 5m0-40-5 5M17 47l-5 5"/>', '#d09a3f'),
      illustrated('crescent', 'Crescent moon', '<path fill="#e2d6fa" d="M43 9a23 23 0 1 0 11 36A25 25 0 0 1 43 9Z"/><path d="m47 14 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/>', '#9473bd'),
      illustrated('astronaut', 'Astronaut helmet', '<rect x="10" y="12" width="44" height="40" rx="18" fill="#d7e9ed"/><rect x="17" y="20" width="30" height="21" rx="9" fill="#6b7b9f"/><path stroke="#fff" d="m23 27 8-3"/><path d="M19 53v4h26v-4M7 28v10m50-10v10"/>', '#6c85a0'),
      illustrated('ufo', 'Flying saucer', '<path fill="#cbbcf0" d="M22 29a10 10 0 0 1 20 0"/><ellipse cx="32" cy="34" rx="25" ry="8" fill="#e7dcfa"/><path d="m24 45-7 12m23-12 7 12M32 46v13"/><circle cx="19" cy="34" r="1"/><circle cx="32" cy="35" r="1"/><circle cx="45" cy="34" r="1"/>', '#8c73b7'),
      illustrated('satellite', 'Satellite', '<path fill="#f7d6a0" d="m25 23 15 6-6 15-15-6Z"/><path fill="#c0dcec" d="m7 12 14 6-6 15-14-6m42 4 14 6-6 15-14-6Z"/><path d="m18 24 6 3m11 10 6 3m-6-17 6-12m-3 0 5 2"/>', '#668aa8'),
      illustrated('comet', 'Comet', '<path d="m29 31 22-23M25 25 42 8M36 35l20-20"/><circle cx="21" cy="42" r="13" fill="#f4c3b2"/><path d="m16 38 3-3m3 13 4-2"/>', '#c57b69'),
      illustrated('telescope', 'Telescope', '<path fill="#c2d8f2" d="m11 24 32-14 6 15-32 14Z"/><path d="m10 22 8 19m25-32 7-3 8 19-7 3M32 34v7m0 0L18 58m14-17 14 17m-14-17v17"/>', '#728eb9'),
      illustrated('galaxy', 'Spiral galaxy', '<path d="M38 31c0 8-13 10-17 2-5-11 13-23 25-12 17 16-6 36-24 27C0 37 16 8 38 10"/><ellipse cx="33" cy="31" rx="4" ry="4" fill="#d3b9ed"/><path d="M8 12h5m-3-3v6m40 31h7m-3-3v6"/>', '#a077b4'),
      illustrated('constellation', 'Constellation', '<path d="m11 43 12-26 14 20 16-23"/><g fill="#fff0bc"><circle cx="11" cy="43" r="4"/><circle cx="23" cy="17" r="4"/><circle cx="37" cy="37" r="4"/><circle cx="53" cy="14" r="4"/></g><path d="m8 13 4 2m39 36 3 3"/>', '#a38b58'),
      illustrated('mars', 'Mars', '<circle cx="32" cy="32" r="22" fill="#edb79d"/><path d="m15 24 13-4 8 6 15-1m-35 9 14 6 17-4m-14-22 5 6"/><circle cx="24" cy="42" r="3"/><circle cx="42" cy="25" r="4"/>', '#b9745e'),
      illustrated('black-hole', 'Black hole', '<ellipse cx="32" cy="32" rx="27" ry="9" transform="rotate(-20 32 32)" fill="#ead0b5"/><circle cx="32" cy="32" r="15" fill="#554b75"/><path d="M18 18a20 20 0 0 1 32 14M14 35a19 19 0 0 0 29 13"/>', '#9974bd'),
      illustrated('lander', 'Lunar lander', '<path fill="#f5dfac" d="m25 15 14 0 9 17-8 8H24l-8-8Z"/><path d="M32 15V6m-4 0h8M23 40l-9 15m27-15 9 15M8 56h12m24 0h12"/><rect x="27" y="23" width="10" height="9" rx="2" fill="#fff"/>', '#b99c61'),
      illustrated('alien', 'Alien', '<path fill="#c2dfc6" d="M11 27c0-26 42-26 42 0 0 15-16 30-21 30S11 42 11 27Z"/><path fill="#63836f" d="M18 26c10-2 13 6 11 11-7 0-11-5-11-11Zm28 0c-10-2-13 6-11 11 7 0 11-5 11-11Z"/><path d="M29 46h6"/>', '#719a7f'),
      illustrated('space-station', 'Space station', '<rect x="25" y="17" width="14" height="31" rx="4" fill="#d5e3ee"/><path d="M32 17V7m-8 26H10m44 0H40"/><path fill="#bbd0ed" d="M3 21h16v24H3Zm42 0h16v24H45Z"/><path d="M11 22v22m42-22v22M4 33h14m28 0h14"/>', '#6f8eb0'),
      illustrated('meteor-shower', 'Meteor shower', '<path d="m17 35 20-23M25 43l25-28M39 47l16-18"/><path fill="#f4cf94" d="m14 34 5 7-8 6-6-5Zm9 12 5 6-8 7-5-5Zm14 3 5 5-7 7-5-4Z"/>', '#c89354'),
      illustrated('orbit', 'Orbital path', '<ellipse cx="32" cy="32" rx="12" ry="26" transform="rotate(40 32 32)"/><ellipse cx="32" cy="32" rx="12" ry="26" transform="rotate(-40 32 32)"/><circle cx="32" cy="32" r="6" fill="#cab6eb"/><circle cx="12" cy="19" r="4" fill="#eebcb4"/>', '#a083bf'),
      illustrated('flag', 'Moon landing flag', '<path d="M20 51V10m0 0c11-6 15 7 27 1v22c-12 6-16-7-27-1" fill="#efc5d0"/><path d="M7 57q24-14 50 0"/><circle cx="39" cy="53" r="3"/>', '#b47a99'),
    ]),
    nature: collection('Nature', '🌿', 'Find your calm in the great outdoors.', emojiCards([
      ['🌻', 'Sunflower'], ['🌵', 'Cactus'], ['🌴', 'Palm tree'], ['🌲', 'Evergreen tree'],
      ['🍄', 'Mushroom'], ['🌈', 'Rainbow'], ['🌊', 'Ocean wave'], ['🔥', 'Campfire'],
      ['❄️', 'Snowflake'], ['🌸', 'Cherry blossom'], ['🌹', 'Rose'], ['🍁', 'Maple leaf'],
      ['🍀', 'Four leaf clover'], ['🌾', 'Golden grain'], ['🐚', 'Seashell'], ['🪨', 'Boulder'],
      ['⛰️', 'Mountain'], ['☁️', 'Cloud'], ['⚡', 'Lightning'], ['💧', 'Water drop'],
    ])),
    technology: collection('Technology', '💻', 'Plug into a different kind of focus.', [
      illustrated('laptop', 'Laptop', '<path fill="#c8d9f2" d="M13 13h38v29H13Z"/><path fill="#e6eef9" d="m13 42-7 9c0 3 52 3 52 0l-7-9"/><path d="m26 24-5 4 5 4m12-8 5 4-5 4m-7 14h4"/>', '#738eb7'),
      illustrated('phone', 'Smartphone', '<rect x="19" y="6" width="26" height="52" rx="6" fill="#d7c9ed"/><path d="M28 12h8m-9 32 5-6 5 6m-5-6V25m-2 27h4"/>', '#9379b3'),
      illustrated('headphones', 'Headphones', '<path d="M11 35v-7a21 21 0 0 1 42 0v7"/><rect x="7" y="31" width="12" height="23" rx="5" fill="#f1c6d3"/><rect x="45" y="31" width="12" height="23" rx="5" fill="#f1c6d3"/>', '#b27f97'),
      illustrated('gamepad', 'Game controller', '<path fill="#c9dece" d="M16 19h32c10 0 18 34 8 36-7 1-10-13-15-13H23c-5 0-8 14-15 13-10-2-2-36 8-36Z"/><path d="M16 26v12m-6-6h12m9-13v-8h8"/><circle cx="45" cy="28" r="2"/><circle cx="51" cy="35" r="2"/>', '#71947f'),
      illustrated('microchip', 'Microchip', '<rect x="17" y="17" width="30" height="30" rx="4" fill="#cebde7"/><rect x="24" y="24" width="16" height="16" rx="2"/><path d="M24 7v10m8-10v10m8-10v10M24 47v10m8-10v10m8-10v10M7 24h10M7 32h10M7 40h10m30-16h10M47 32h10m-10 8h10"/>', '#9375b8'),
      illustrated('camera', 'Camera', '<path fill="#d3e1ed" d="M8 19h12l4-7h16l4 7h12v34H8Z"/><circle cx="32" cy="35" r="11" fill="#b0c5e0"/><circle cx="32" cy="35" r="5" fill="#edf4ff"/><path d="M47 25h3"/>', '#6f8dab'),
      illustrated('keyboard', 'Keyboard', '<rect x="4" y="18" width="56" height="31" rx="5" fill="#dfd3ef"/><path d="M12 26h3m7 0h3m7 0h3m7 0h3m7 0h1M12 34h3m7 0h3m7 0h3m7 0h3M18 42h27"/>', '#9c80ba'),
      illustrated('mouse', 'Computer mouse', '<rect x="17" y="15" width="30" height="43" rx="15" fill="#f2d0bd"/><path d="M32 15V7h15m-15 9v16m-14 1h28"/><rect x="30" y="21" width="4" height="7" rx="2"/>', '#b78a73'),
      illustrated('wifi', 'Wi-Fi router', '<rect x="9" y="39" width="46" height="15" rx="4" fill="#c5dedb"/><path d="M15 39V28m34 11V28M19 20q13-14 26 0M25 26q7-7 14 0"/><circle cx="32" cy="32" r="2" fill="#6c9a91"/><path d="M16 47h3m6 0h3"/>', '#719d95'),
      illustrated('battery', 'Battery', '<rect x="7" y="17" width="46" height="30" rx="5" fill="#c4ddbc"/><path d="M54 26h4v12h-4"/><path fill="#f5e4a2" d="m34 21-12 15h10l-2 8 12-15H32Z"/>', '#7b9c69'),
      illustrated('server', 'Server rack', '<rect x="13" y="7" width="38" height="50" rx="4" fill="#c6d5e8"/><path d="M13 23h38M13 40h38m-29-25h3m-3 17h3m-3 16h3m13-33h5m-5 17h5m-5 16h5"/>', '#788ea8'),
      illustrated('cloud-upload', 'Cloud upload', '<path fill="#cfe3f2" d="M18 46a13 13 0 1 1 0-26 16 16 0 0 1 30-1 13 13 0 0 1 0 27"/><path d="M32 56V29m-9 9 9-9 9 9"/>', '#799db9'),
      illustrated('smartwatch', 'Smartwatch', '<path fill="#e5bed5" d="M24 4h16l3 15H21Zm-3 41h22l-3 15H24Z"/><rect x="17" y="18" width="30" height="28" rx="8" fill="#f9e4ef"/><path d="m22 33 6-7 6 12 7-9"/>', '#b881a2'),
      illustrated('printer', 'Printer', '<path fill="#d2dfd2" d="M16 26V9h32v17M16 43H7V25h50v18h-9"/><path fill="#eff5ea" d="M16 36h32v22H16Z"/><path d="M23 43h18m-18 7h13m10-19h4"/>', '#839e7b'),
      illustrated('lightbulb', 'Smart bulb', '<path fill="#f6df9a" d="M23 44c0-9-9-10-9-22a18 18 0 0 1 36 0c0 12-9 13-9 22Z"/><path d="M24 50h16m-13 6h10m-5-12V29m-6-6 6 6 6-6"/>', '#bb994c'),
      illustrated('usb-drive', 'USB drive', '<path fill="#cedfe7" d="m19 9 13-6 9 18-13 6Z"/><path fill="#b4c8d9" d="m27 22 16-8 16 32c5 10-13 19-18 9Z"/><path d="m25 12 2 4m5-8 2 4m11 24 3 6"/>', '#7994a8'),
      illustrated('padlock', 'Digital lock', '<path d="M20 28V17a12 12 0 0 1 24 0v11"/><rect x="11" y="27" width="42" height="30" rx="6" fill="#d2c1e8"/><circle cx="32" cy="39" r="4" fill="#fff"/><path d="M32 43v6"/>', '#947ab5'),
      illustrated('drone', 'Drone', '<path d="m23 25-9-9m27 9 9-9M23 39l-9 9m27-9 9 9"/><rect x="22" y="22" width="20" height="20" rx="5" fill="#cbe2dc"/><g fill="#e5f2ed"><ellipse cx="12" cy="12" rx="10" ry="6"/><ellipse cx="52" cy="12" rx="10" ry="6"/><ellipse cx="12" cy="52" rx="10" ry="6"/><ellipse cx="52" cy="52" rx="10" ry="6"/></g>', '#7caa9b'),
      illustrated('circuit', 'Circuit board', '<rect x="6" y="7" width="52" height="50" rx="6" fill="#d3e5c9"/><path d="M6 21h14l8 8m30 13H44l-8-8M20 57V44l8-8m10-29v13l-5 7"/><rect x="25" y="25" width="14" height="14" rx="2" fill="#aac495"/><circle cx="15" cy="14" r="2"/><circle cx="49" cy="49" r="2"/>', '#7c9a6c'),
      illustrated('vr-headset', 'VR headset', '<path d="M11 29V18q21-12 42 0v11"/><path fill="#c4c9e7" d="M8 25h48v25H40l-8-8-8 8H8Z"/><rect x="15" y="31" width="12" height="10" rx="4" fill="#eff0fa"/><rect x="37" y="31" width="12" height="10" rx="4" fill="#eff0fa"/>', '#8286b2'),
    ]),
  });

  const CARD_BACKS = Object.freeze({
    sparkle: Object.freeze({ name: 'Sparkle', art: '<svg viewBox="0 0 24 24"><path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z"/></svg>' }),
    orbit: Object.freeze({ name: 'Orbit', art: '<svg viewBox="0 0 48 48" fill="none"><ellipse cx="24" cy="24" rx="21" ry="9" transform="rotate(-30 24 24)"/><ellipse cx="24" cy="24" rx="9" ry="21" transform="rotate(-30 24 24)"/><circle cx="24" cy="24" r="5"/></svg>' }),
    quilt: Object.freeze({ name: 'Quilt', art: '<svg viewBox="0 0 48 48"><path d="m24 7 17 17-17 17L7 24Z"/><path d="m24 16 8 8-8 8-8-8Z" class="quilt-cutout"/></svg>' }),
    waves: Object.freeze({ name: 'Waves', art: '<svg viewBox="0 0 48 48" fill="none"><path d="M3 25q7-9 14 0t14 0 14 0M3 34q7-9 14 0t14 0 14 0"/><circle cx="25" cy="12" r="6"/></svg>' }),
  });
  const BOARD_COLORS = Object.freeze({
    paper: Object.freeze({ name: 'Paper', color: '#ffffff' }),
    lavender: Object.freeze({ name: 'Lavender', color: '#e2d4fa' }),
    mint: Object.freeze({ name: 'Mint', color: '#cce7db' }),
    peach: Object.freeze({ name: 'Peach', color: '#f7d8c1' }),
    ocean: Object.freeze({ name: 'Ocean', color: '#c7deef' }),
  });
  const APPEARANCES = Object.freeze({
    daydream: Object.freeze({ name: 'Daydream', description: 'Soft & playful', colors: ['#f5f3fc', '#7754d6', '#fff'] }),
    sunset: Object.freeze({ name: 'Sunset', description: 'Warm & golden', colors: ['#fcf2e8', '#9d4c37', '#fffcf8'] }),
    midnight: Object.freeze({ name: 'Midnight', description: 'Quiet & cosmic', colors: ['#171c30', '#b5a1ff', '#252d46'] }),
  });
  const DEFAULT_PREFERENCES = Object.freeze({ collection: 'fruits', back: 'sparkle', board: 'paper', appearance: 'daydream' });
  const normalizePreferences = value => {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const choices = { collection: CARD_THEMES, back: CARD_BACKS, board: BOARD_COLORS, appearance: APPEARANCES };
    return Object.fromEntries(Object.entries(choices).map(([key, allowed]) => [key,
      typeof input[key] === 'string' && Object.hasOwn(allowed, input[key]) ? input[key] : DEFAULT_PREFERENCES[key],
    ]));
  };
  const renderFace = design => design.art || design.emoji;
  const api = { CARD_THEMES, CARD_BACKS, BOARD_COLORS, APPEARANCES, DEFAULT_PREFERENCES, normalizePreferences, renderFace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlipSideThemes = api;
})(globalThis);
