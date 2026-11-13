# FlipSide — a feel-good memory game

**Play live: https://flipside-memory.vercel.app** · [Private GitHub repository](https://github.com/pranjalmishr/flipside-memory)

A standalone, responsive memory-matching game. Existing workspace applications are not modified. No build step, account, API key, or runtime libraries are required.

## Play

Open **[index.html](index.html)** directly in a modern browser, or serve this folder:

```sh
python3 -m http.server 5195 --bind 127.0.0.1
```

Then visit **http://127.0.0.1:5195**.

DM Sans and Manrope are bundled locally with their font licenses in `fonts/`; there are no external font, image, music, or application requests. System fonts remain a fallback if a browser restricts local-file font access.

For reproducible development and production packaging, use Node 22 or newer:

```sh
npm ci
npm run dev                 # http://127.0.0.1:5195
npm test                    # pure rules, state, storage, and audio tests
npx playwright install chromium firefox webkit
BROWSER_CHANNEL=chromium npm run test:browser
npm run build               # allow-listed production files only, in dist/
```

The direct-file option needs no Node installation or build. The build step is for Vercel publishing and excludes tests, documentation, local environment files, and tooling.

## Features and rules

- Choose a difficulty before starting:
  - **Easy:** 4 rows × 4 columns, 16 cards / 8 matching pairs.
  - **Medium:** 4 rows × 5 columns, 20 cards / 10 matching pairs.
  - **Hard:** 6 rows × 6 columns, 36 cards / 18 matching pairs.
- Start a game, then flip two cards. Each two-card attempt is one move.
- Matching cards remain face up, marked with a check. Each pair earns **100 points**; mismatches have no score penalty.
- Unmatched cards automatically flip back after **1 second**. Additional flips are blocked during that delay.
- The timer starts on the **first flip or power-up**, not difficulty selection, and stops at the final match. Time spent paused or away after hiding the tab does not count. Reading instructions, audio settings, or customization during active play still counts unless you pause first.
- **Restart** starts the current level over, clears all statistics, and shuffles a fresh deck. **New game** uses the selected difficulty; changing the selector alone will not erase a running game.
- Every new game shuffles the pictures and their positions using Fisher–Yates. Card-back colors are decorative and reveal no information about pairs.
- Live accuracy and potential speed-bonus feedback, followed by a results screen with stars, total score, time, moves, accuracy, and a pair-points / speed-bonus breakdown.
- Victory summary with optional confetti, play again, and locally saved fastest times and best scores. Existing fastest-time records are preserved; old times do not invent a score or leaderboard history.
- Optional synthesized sound effects and background music, both off by default, with independent volume controls. No audio downloads.
- Keyboard: Tab to a card, arrows to navigate, Home/End for the first/last card, Enter/Space to flip. **P** pauses/resumes, **H** uses a hint, and **S** shuffles (outside form fields and dialogs). Escape dismisses dialogs. Screen-reader card labels and live feedback are included.
- Responsive layouts from 320 px; card targets are at least 44 × 44 px. Reduced-motion settings disable flips, pop animations, and confetti.
- Phone play scrolls the board into view. Desktop play uses a compact header and viewport-bounded board so every card stays visible at the tested laptop/desktop sizes. Major controls have 44 px touch targets; all three appearances have automated contrast checks.
- Corrupt or unavailable browser storage does not prevent gameplay. No tracking or gameplay data is sent to a server.

## Audio, pause, and power-ups

- Header controls independently enable/mute **sound effects** and **background music**. **Audio & volume** under the start button provides separate on/off switches and 0–100% volume sliders. Settings persist locally; the original sound preference is migrated.
- Distinct synthesized sounds cover the first flip, match, miss, victory, hint, and shuffle. Background music is an original procedural melody with a soft bass accompaniment. It loops without streaming or external assets.
- Browser autoplay policies are respected: audio starts only following a user interaction. After reload, an enabled preference may wait for Play, Resume, or an audio-control click. Unsupported audio reports a limitation and leaves the game playable silently.
- **Pause** hides the entire board (including matched cards and accessible picture names), blocks play, and freezes elapsed time, potential speed bonus, and pending mismatch/hint delays. **Resume** restores the turn and remaining delay. Paused time is excluded from final scores and times.
- Hiding/leaving the tab automatically pauses and silences audio; returning never resumes the game without a click. Opening **My leaderboard** also pauses active play. Instructions, customization, and audio settings do not pause automatically.
- Each round provides **3 hints** and **2 shuffles**, independent of difficulty. A hint reveals one unmatched pair for **1.5 seconds** without marking it matched. A shuffle rearranges only unmatched cards, leaves matched positions fixed, and guarantees a changed order.
- Finish the current two-card turn before using a power-up. Power-ups are unavailable during a pending reveal or pause; shuffling is also disabled when just one pair remains. Uses are consumed immediately and cannot be regained by reloading.
- Hints and shuffles do not award points, count moves, or change accuracy. Their time counts while active, and any use marks the finish **Assisted**. Results disclose usage; leaderboard filters separate assisted and unassisted performances. There is no additional points or stars penalty.

## Saved games and personal leaderboard

- The active round is saved after every action and approximately once per second while time is running. A page-hide save captures the latest state when the browser permits it. As with any browser app, an abrupt process kill can lose changes after the last successful write.
- Reloading restores a valid saved round **paused**, with the same card order, matched pairs, level, collection, moves, score, elapsed play time, and remaining power-ups. Time spent away does not count. Unfinished single flips, mismatches, and hint reveals close on restore; completed moves and spent power-ups remain counted.
- New game / Restart deliberately replace the one active saved round but never erase your personal bests. A win removes the active save and records a completion exactly once using a stable run ID.
- **My leaderboard** keeps the **top 10 finishes per difficulty** (at most 30). Ranking is highest score, then fastest exact time, then fewer moves, then earlier completion. Each row shows collection, score, stars, time, moves, accuracy, date, and whether hints/shuffles were used.
- Difficulty and play-style filters, best-score/fastest-time summaries, honest empty states, and a results-screen shortcut are included. Filters operate on the saved top 10 for that level; they do not create a separate 10-entry archive for every play style.
- The sidebar now shows both the legacy fastest time and the best recorded score for the selected difficulty. Old fastest times remain intact but cannot be turned into historical scores because their collection, assistance, and completion dates were never recorded.
- Progress is validated against the local artwork catalog before restoration; stored HTML/artwork and scores are not trusted. Invalid snapshots are discarded, and derived leaderboard statistics are recalculated. This is data-shape protection, **not anti-cheat**: a local leaderboard is editable personal data, not a verified online ranking.
- Storage keys: `flipside-progress-v1` (one active game), `flipside-runs-v1` (top scores), `flipside-audio-v1` (audio preferences). Existing `flipside-best-v1`, `flipside-look-v1`, and `flipside-sound` remain supported.
- Data stays in this browser profile and origin; there are no accounts, cloud sync, or cross-device leaderboards. One active save is shared by tabs on the same origin, so play one tab at a time. Private mode, quota limits, clearing browser data, or moving to another host can prevent persistence. The game reports unavailable saving and falls back to the current tab’s memory.

## Card collections and customization

Open **Card collections, backs & colors** under the start button to make the game your own.

- **Six collections:** Animals, Emojis, Fruits, Space, Nature, and Technology.
- Each collection has **20 distinct, named designs** (120 total). Easy randomly picks 8 pairs, Medium 10, and Hard 18 from the selected collection. No artwork is reused across collections, and each chosen design appears exactly twice in a deck.
- Animals, Emojis, Fruits, and Nature use curated, category-specific emoji artwork. Space and Technology each have 20 original inline SVG illustrations with different silhouettes and details, not a set of recolored duplicates. Every card has a descriptive accessible name.
- **Four card backs:** Sparkle, Orbit, Quilt, and Waves. Back designs and position-based pastel colors never reveal pair identities.
- **Five board colors:** Paper, Lavender, Mint, Peach, and Ocean.
- **Three visual appearances:** Daydream (light pastel), Sunset (warm cream and terracotta), and Midnight (dark navy and lavender). These restyle the overall interface, controls, dialogs, and results, independently of the card collection and board color.
- All choices have previews and keyboard-operable radio controls. Settings are saved locally under `flipside-look-v1` when storage is available. Unsupported or corrupt settings fall back to safe defaults. There is no cloud sync.
- Before starting, a collection selection updates the hidden board preview. During play, it is queued for **New game**; it never changes the pictures or pair identities on the current board. **Restart** keeps the active collection, even if another is queued.
- Card backs, board colors, and visual appearance apply **immediately**, preserving card positions, open/matched cards, moves, score, and the running timer. As with instructions, time spent customizing during play counts toward elapsed time.
- Every collection works at all three difficulties and offline. The default look is Fruits / Sparkle / Paper / Daydream. Fastest-time records remain per difficulty and are not erased by changing a theme.

## Scoring and rewards

- **Pair points:** 100 per matched pair. Misses never remove pair points, but count as moves and reduce accuracy.
- **Accuracy:** matched pairs ÷ completed two-card moves × 100. A single flip, duplicate click, or blocked third flip does not count as a move. The UI shows `—` until the first completed move, then percentages to at most one decimal place.
- **Speed targets:** Easy **01:00**, Medium **01:30**, Hard **03:00**.
- **Speed bonus:** `max(0, floor((target milliseconds − elapsed milliseconds) / 1000)) × 5`. This rewards full seconds saved, never becomes negative, and is added to the score **once**, at the final match. The live preview is not awarded early.
- **Total score:** pair points + completion speed bonus. Maximum bonuses are 300 / 450 / 900 points; maximum totals are 1,100 / 1,450 / 2,700 for Easy / Medium / Hard.
- **Stars** are awarded only after completion, using the unrounded accuracy and exact elapsed time:
  - **★★★:** at least 80% accuracy **and** completion within the level target.
  - **★★:** at least 50% accuracy **and** completion within twice the target (unless three stars were earned).
  - **★:** any other completed game.
- The end time, bonus, score, and star rating freeze at victory. A restart resets all current-game statistics and rewards.
- All rules are also explained in the in-game **How to play** window. Results include a next-star goal for one- and two-star games.

## Source

| File | Purpose |
| --- | --- |
| `index.html` | Semantic interface, dialogs, and embedded SVG symbols |
| `styles.css` | Pastel interface, responsive layouts, and animation |
| `engine.js` | Framework-independent game rules and shuffle |
| `themes.js` | Six artwork catalogs, back designs, color choices, and preference validation |
| `audio.js` | Independent sound/music channels, volume controls, and procedural synthesis |
| `storage.js` | Safe local-storage adapter, validated leaderboard records, ranking, and deduplication |
| `game.js` | DOM rendering, input, timer/effect scheduling, recovery, and interface coordination |
| `icon.svg` | Original app icon |
| `scripts/build.cjs` | Allow-listed static production build |
| `vercel.json` | Static hosting, cache policy, CSP, and security headers |
| `.github/workflows/ci.yml` | Unit, build, gameplay, accessibility, and cross-browser CI |

## Verification

Engine tests use Node's built-in runner, without installation:

```sh
node --test tests/*.test.cjs
```

Browser checks require Playwright as **test tooling only**, a running local server, and installed Google Chrome:

```sh
# If Playwright is not already available, install it in a separate tooling folder.
NODE_PATH=/path/to/tooling/node_modules node tests/browser.cjs
NODE_PATH=/path/to/tooling/node_modules node tests/browser-themes.cjs
NODE_PATH=/path/to/tooling/node_modules node tests/browser-player.cjs
NODE_PATH=/path/to/tooling/node_modules node tests/browser-release.cjs
```

`GAME_URL` can override the default test address. The browser script also checks direct `file://` offline play and generates screenshots in `artifacts/`.

Verified in Chromium / Google Chrome:

- **141 unit tests pass:** game rules, rewards, all themes, exact pause accounting, power-up limits, snapshot validation/round-trips, safe storage, score ranking/deduplication, audio scheduling/mute behavior, mixed-type input rejection, and seeded state-transition stress tests for every collection/difficulty.
- **107 browser checks pass:** full games at all levels, one-/two-/three-star outcomes, live and final accuracy, score breakdowns, slow finishes, small-phone results, flip-back timing, restart during a pending mismatch, keyboard interaction, dialogs, sound toggle, best-time persistence, blocked storage, reduced motion, and offline play.
- Responsive checks at 320, 360, 390, 430, 768, 1024, and 1440 px for every difficulty, including internal stats clipping, card spacing, and target sizes.
- **76 additional theme browser checks pass:** all six Hard games, independent appearance controls, preservation of active games, saved and invalid preferences, storage-blocked operation, offline vector artwork, and narrow-screen customization layouts.
- **61 additional player browser checks pass:** live audio synthesis, independent music/effects/volume controls, pause/resume and frozen reveals, limited hints/shuffles, saved-game recovery without offline time, assisted score filtering, ranking and best scores, persistence, empty/invalid data, unsupported audio, blocked storage, and quota-error recovery.
- The release suite adds **264 Chromium, Firefox, and WebKit checks** covering all difficulties, seven viewport sizes, exact save recovery, hints/shuffles, keyboard focus/repeat protection, late-result navigation, long timers, local-only assets, and automated WCAG A/AA checks across all skins and dialogs. Automated checks are not a complete accessibility certification or physical-device test.
- Local release gate: **141 unit tests + 508 browser checks passed**. The public Vercel deployment also passed **94 production release checks**, including all three difficulties, saved-state recovery, accessibility, security headers, and rejection of private/tooling paths. See [RELEASE.md](RELEASE.md).
- Desktop and phone audio, paused-board, and leaderboard screens were visually inspected, along with the existing game, results, customization, themed boards, and all 40 original vector illustrations. Release screenshots are generated under `artifacts/release/`.

## Publishing

- Private repository: **https://github.com/pranjalmishr/flipside-memory**.
- Vercel project: **flipside-memory**, connected to that repository; production branch `main`.
- Build: `npm run build`; public directory: `dist/`. No runtime secrets or paid backend services are needed.
- Vercel publishes only the application and local fonts, with a self-only script/font CSP, frame protection, MIME-sniffing protection, and revalidated application assets.
- GitHub Actions runs the same test suites against the built files on every `main` push and pull request. Vercel builds pushed commits independently; inspect both checks before treating a release as verified.
- The final verified production address and release notes are recorded in [RELEASE.md](RELEASE.md).
- Browser-local progress is origin-specific: a local preview and the production domain have separate saves and leaderboards.
