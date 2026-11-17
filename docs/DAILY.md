# Daily memory challenge — online mode

Live at **https://flipside-memory.vercel.app**. Open **Play the daily challenge** in the game setup sidebar.

## Puzzle and competition

- One **4 × 5 board / 10 pairs** for each UTC date. Everyone receives the same picture selection and card order; the collection rotates across the six catalogs.
- The order is deterministic from an HMAC-derived server-only seed and UTC date. The published daily puzzle is stored so a warm/cold server instance or redeploy cannot reshuffle an existing date. The seed is an encrypted Vercel environment value and is never sent to browsers or Git.
- There is **one resumable ranked attempt per guest per UTC day**. Starting again or reloading returns that attempt, including moves and the current open turn, rather than creating a new score opportunity.
- The server reveals only a card being flipped (and previously matched cards), counts every two-card attempt, checks card state/version, enforces the mismatch delay, and writes the final result. A browser cannot post a score, claim a completion, or choose another player's UID.
- Rankings prioritize **fewest moves**, then **fastest server elapsed time**, then earlier completion. The top 50 confirmed finishes are visible, plus the current guest's exact own rank even outside the top 50.
- Ranked time begins on the first server-accepted flip. It is **wall time**, including request latency, time in another tab, reconnection gaps, or time spent with the window closed. There are no ranked timer pauses, hints, shuffles, or resets. This differs intentionally from the pauseable local practice game.
- Complete before **00:00 UTC**. An unfinished prior-day attempt expires and cannot earn that day's reward after rollover. The next date starts a new independent attempt.
- The last seven dates have a read-only leaderboard archive. API history reads are bounded to 30 days. Empty rankings are genuine empty states, not sample data.

## Daily rewards and streaks

- The first completion for a UTC date earns **100 reward credits**, plus **10 for each prior consecutive day**, up to **160 credits** per completion.
- Example: consecutive days earn 100, 110, 120, 130, 140, 150, then 160; further consecutive dates continue at 160.
- Credits are an achievement balance, **not money**, a spendable currency, or extra leaderboard points. Daily results and the wallet show the credit award separately from practice scores.
- The completion entry, claimed date, reward balance, completion count, active streak, and longest streak update in **one Firestore transaction**. Duplicate requests, repeated result reads, or repeated starts cannot claim again.
- Active streak means consecutive UTC completion dates ending today or yesterday. Before finishing today, yesterday's streak is still active. Missing an entire UTC date resets the active streak; longest streak and accumulated credits remain.
- The dashboard shows current/longest streak, reward balance, a seven-day completion strip, UTC date, and time until the next puzzle.
- You can copy a shareable daily result with date, moves, time, accuracy, and streak. Private identity/session tokens are never included.

## Identity and data boundaries

- Players receive an **anonymous Firebase guest** identity under the existing `nitre-d8cdd` project. It uses a FlipSide-specific browser storage key, not the login/session keys of other applications.
- A generated public alias such as `Curious Owl AB12` is based on the guest UID. No email or user-written public name is sent to the leaderboard. Other guests' UID and private attempts are not in the public response.
- The guest refresh session is browser-local under `flipside-daily-guest-v1`. Clearing storage, changing browser/profile, or moving from localhost to the production domain creates a different guest identity and does not transfer daily rewards or streaks. There is no registered-account linking or cross-device recovery in this release.
- Local practice progress, power-ups, personal scores, and pause behavior are unchanged. Opening Daily pauses an active practice round; returning to practice requires an explicit resume. Daily does not write a ranked finish into the browser-local practice leaderboard.
- Shared data is exclusively under **`flipsideDaily/v1`**:

| Path | Contents |
| --- | --- |
| `days/{UTC-date}` | Private published puzzle and artwork/order |
| `days/{UTC-date}/attempts/{uid}` | Private engine state, action dedupe IDs, version, and timing |
| `days/{UTC-date}/entries/{uid}` | Completed public-display result and sortable rank key |
| `players/{uid}` | Private completed dates, credit balance, and streak records |
| `rates/{uid}` | Per-guest request-rate bucket |

Browsers access these through `/api/daily` only. The existing Firestore rules were **not changed**; live tests confirm browser Firebase ID tokens cannot directly read hidden daily data, including their own attempt and profile documents.

## Backend and security

- Vercel Node function: `api/daily.js`, calling the existing memory engine through `server/daily-service.cjs`.
- Only the production environment is provisioned for cloud access. Pull-request/preview builds do not receive the daily seed or federation permission; their practice game still works. CI tests daily behavior against a separate in-memory fixture, never the production backend.
- Server-only Firestore access uses the dedicated **`flipside-vercel@nitre-d8cdd.iam.gserviceaccount.com`** identity, with **no private key**. Google workload identity federation trusts only this Vercel project's **production** identity.
- As with the other apps on this shared Firebase project, Firestore's service-account IAM permission is **project-wide**. The code's namespace guard prevents accidental other-app paths, but this is not stronger per-document IAM isolation. A separate project would provide that stronger boundary.
- Billing remains disabled. No Firebase provider settings, authorized domains, other app data, or live Firestore rules were changed.
- API safeguards: Firebase ID-token verification, exact action fields, origin allow-list, JSON-only 4 KB requests, bounded date/input checks, per-guest rate limit (45 requests per 10 seconds), transaction version checks, bounded duplicate-ID history, and server-derived results.
- Unknown `finish`, `score`, `uid`, `time`, `pause`, `hint`, or `shuffle` requests are rejected. First and second flips remain separate authenticated actions; a third flip cannot bypass the mismatch lock.
- Client retry uses the **same action ID**. A retry after a committed final flip recovers the completed result and rankings without awarding another reward.
- Public responses are not cached; a disconnected browser shows a recoverable service error, never fictional scores. Reload recovers server state. No offline ranked results are accepted.
- The Firebase public web API key is returned by the public configuration endpoint, as required for guest authentication; it is not a backend credential. CSP permits only the game's own service and the two Firebase Auth endpoints for daily requests.
- Firebase Admin **13.10.0** is pinned because Admin 14's transitive `jwks-rsa`/`jose` combination required experimental CommonJS/ESM interop unavailable in this Vercel runtime. A dedicated test verifies module loading with that interop disabled. `uuid` is overridden to CommonJS-compatible **11.1.1** to address the SDK's transitive buffer-bounds advisory; `npm audit` reports zero vulnerabilities for this dependency set.

### Operational limits

- Anonymous guests are rate-limited by UID. Someone can create multiple guests; **App Check/CAPTCHA and registered-player identity are not implemented**, so this is not a bot-proof or one-human-one-attempt guarantee.
- The daily arrangement is hidden in normal browser responses, but once learned a player could share it or automate guesses. Server-authoritative turns prevent forged results, not all forms of cheating.
- Ranking time includes network/server latency, so distant or unstable connections can be slower. This is not a latency-compensated esports timer.
- The backend shares the existing free Firestore/Auth quota with the other apps. A standard 20-flip finish performs roughly 100 transactional reads plus writes and overview queries. Higher traffic can exhaust the shared free quota; errors are reported and practice remains playable. No automatic plan upgrade is configured.
- Old attempts/results/rate documents have **no scheduled cleanup or paid TTL policy**. UI history is bounded, but cloud records remain until a future retention process is deliberately added. Local seven-day tests use isolated memory data; production acceptance deletes its known temporary guest records.

## Development and verification

```sh
npm ci
npm test

# Isolated daily API fixture — no cloud credentials or production writes:
PORT=5196 node scripts/daily-dev.cjs --test
node tests/browser-daily.cjs

# Real local preview (authorized developer only):
# Pull production values to the gitignored .env.daily.local via the Vercel CLI.
# Existing Firebase CLI ADC is read only on the developer host, never deployed.
npm run dev:daily
```

- **27 daily unit/API/runtime tests** cover date validation, deterministic boards, hidden-state privacy, identity isolation, duplicate/concurrent requests, matching/mismatch rules, unsupported power-ups/submissions, real ranking order, once-only rewards, consecutive dates, missed days, leap/year boundaries, expiry/history, rate limits, network retries, blocked storage, and hosted-module compatibility.
- **34 isolated two-browser checks** cover the actual daily interface, identical arrangements, reload recovery, no-pause timing, failed attempts, real shared responses, reward/streak updates over simulated dates, archive behavior, 320–1440 px layout, all three visual themes' accessibility, and reconnect errors.
- **61 real production acceptance checks** passed with two temporary independent Firebase guests on desktop/phone, including real Firestore state, server-calculated results, private-data denial by the unchanged rules, forged input/token/origin rejection, rewards, duplicate protection, and shared rankings. Those known test guest accounts and their FlipSide attempt/entry/profile/rate records were removed; the shared published puzzle was retained.
- All **168 unit tests** pass. The prior **508 practice/browser release checks** were re-run, with the final cross-browser accessibility pass after daily invitation contrast fixes.
- Rendered daily desktop and phone screens were visually inspected. Future streak progression was verified with controlled clocks, not by claiming that several real UTC days elapsed during one test session.

`tests/daily-live.cjs` is an explicitly authorized acceptance tool; it is not run by CI. It requires developer Google authentication and creates/cleans temporary guests. CI uses only the isolated daily fixture and never production credentials.
