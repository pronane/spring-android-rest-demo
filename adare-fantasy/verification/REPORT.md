# Verification report — Twenty-Eight v0.2.2

**Scope:** review and test `master` at `f107d9c` (merge of PR #3, *"fix account takeover, server-side
card validation, demo 'paid' state"*), then run an end-to-end verification of the app served from a
production build (`next build && next start`).

**Re-run:** 31 October 2026 on `master` at `03fa805` (merge of PR #5 — the two fixes below), with a
clean store. Videos and screenshots in this folder are from that run; the harness that produced them
is in [`harness/`](harness).

**Date:** 31 October 2026 · **Runner:** headless Chromium 141 via Puppeteer, axe-core 4.14, Node 22

**Result: 54/54 automated checks pass** — 17 API, 15 browser, 22 accessibility — after fixing two
regressions found during the review. The re-run also produced 23 screenshots and 3 videos from 20
scripted steps with zero console errors. Evidence is in [`screenshots/`](screenshots) and
[`videos/`](videos).

---

## 1. What changed on master since the last verified state

`3d802e9` (PR #2, accessibility polish) → `f107d9c` (PR #3) touched 10 files, +316/−104:

| File | Change |
|---|---|
| `lib/server/auth.ts` | Refuses the public dev HMAC secret in production; requires `SESSION_SECRET` (16+ chars) |
| `app/api/session/route.ts` | Tighter email validation; **409 when an existing email is submitted without that account's session** (account-takeover fix) |
| `app/api/entry/route.ts` | Server-side card validation: squad size, duplicates, budget, side limits, captain membership, prediction/award sanitising, first-tee lock (423) |
| `app/api/checkout/route.ts` | Unknown plan ids now return 400 instead of silently charging the default |
| `lib/server/db.ts` | Atomic write (temp file + rename) and an in-process mutation queue; `findUserByEmail`; UUID-based receipt refs |
| `lib/store.tsx` | Demo card no longer ships a paid entry; squad/captain normalisation; unique league codes; slower paths fixed |
| `app/draft/page.tsx` | Save errors surfaced, "saved" resets after edits, awards sent with the card |
| `app/predict/page.tsx` | New **Save my picks** button so predictions reach the server |
| `lib/helpers.ts` | Pruned auto-pick search (Captain's Dozen 383 ms → ~1 ms) |
| `app/enter/page.tsx` | Surfaces the 409 message instead of a generic failure |

**Verdict:** the security work is sound and the fixes are real. Three issues were left, two of them
regressions introduced by this commit; all are fixed on this branch (section 3).

---

## 2. Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **High** | **A paid entry was erased on reload.** `normalise()` discarded any stored entry when `isDemo` was true, but paying on the pre-loaded demo card never cleared that flag. Reproduced: localStorage held `entry.paid: true` **and** `isDemo: true`; after a reload the header fell back to "Enter · €10", `/draft` showed "Enter €10 to save" and the card could not be saved — the visitor had paid and lost the game. | **Fixed** |
| 2 | Medium | **Checkout was pre-filled with the demo identity**, so typing produced `Séamus RyanAoife Byrne` / `Bogey MerchantsSunday Best`. | **Fixed** |
| 3 | Medium | **Production now needs `SESSION_SECRET`, but the README still says no env vars are required.** Verified: without it, `POST /api/session` and any request carrying a session cookie return **500** with `SESSION_SECRET must be set (16+ chars) in production`, while pages still render 200 — so the failure only appears at checkout as "Could not create the account." | **Documented** (`.env.example` + README) |
| 4 | Low | `/api/entry` validates the card **before** checking for a paid entry, so an unpaid user with an invalid squad sees `422` rather than `402`. Cosmetic; left as-is so the client keeps precise validation messages. | Noted, unchanged |
| 5 | Low | The mutation queue in `lib/server/db.ts` is per-process: two Node instances sharing the JSON file can still lose a write. Already called out as the Postgres caveat in the README. | Noted, unchanged |

### Fixes applied on this branch

```diff
# lib/store.tsx — a real payment outranks the demo flag
- entry: raw.isDemo ? EMPTY_STATE.entry : { ...EMPTY_STATE.entry, ...(raw.entry ?? {}) },
+ const storedEntry = raw.entry?.ref === LEGACY_DEMO_REF
+   ? EMPTY_STATE.entry                                  // drop the old fake receipt only
+   : { ...EMPTY_STATE.entry, ...(raw.entry ?? {}) };
+ entry: storedEntry,
+ isDemo: Boolean(raw.isDemo) && !storedEntry.paid,

# lib/store.tsx — paying clears the demo flag at the source
- setState((prev) => ({ ...prev, entry: { ...prev.entry, ...entry } }));
+ setState((prev) => ({ ...prev, entry: { ...prev.entry, ...entry }, isDemo: entry.paid ? false : prev.isDemo }));

# app/enter/page.tsx — never pre-fill the demo identity
+ if (state.isDemo) return;
  setManager(state.manager);
  setTeamName(state.teamName);
```

---

## 3. Test results

### 3.1 API contract — 17/17 (`api-results.json`)

Called against the production server with a clean store. Every row is an HTTP status the client
depends on, not an implementation detail.

| Check | Observed |
|---|---|
| invalid email rejected | status 400 |
| account created with a session cookie | status 200 |
| takeover blocked without the session | status 409 |
| unauthenticated write rejected | status 401 |
| unpaid write rejected | status 402 |
| unknown plan rejected | status 400 |
| checkout issues a receipt ref | TE-7C943E-ADRE |
| session cookie is httpOnly + SameSite | Path=/; Expires=Sun, 28 Feb 2027 08:25:04 GMT; Max-Age=10368000; HttpOnly; SameSite=lax |
| valid twelve-player card saves | status 200 |
| unknown match ids dropped | {"fri-am-1":"europe"} |
| invalid awards nulled |  |
| unknown player id rejected | 422: Your card includes a player who is no longer in the pool. |
| wrong squad size rejected | 422: Pick 6 players — you have 7. |
| over-budget card rejected | 422: You are 0.5m over the 100m budget. |
| captain must be on the card | 422: Pick a captain from your card. |
| tampered cookie rejected | status 401 |
| session returns the saved card | 12 players |

### 3.2 Browser end-to-end — 15/15 (`browser-results.json`)

Run against the production server (`next start`) with a clean database, one fresh browser profile per
persona. This is also the pass the videos were recorded from.

| Check | Observed |
|---|---|
| fresh visitor is offered a paid entry, not a card | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Live \| Leagues \| Rules \| |
| entry page lists three paid plans and no free tier | ✅ |
| checkout does not pre-fill the demo identity | ✅ |
| unpaid card cannot be saved | ✅ |
| payment issues a receipt | TE-F6DAE0-ADRE |
| header shows My card after paying | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Live \| Leagues \| Rules \| |
| paid state survives a reload | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Live \| Leagues \| Rules \| |
| twelve-player card saves | ✅ |
| predictor fills all 28 matches | 28/28 |
| picks save to the server | ✅ |
| account shows the saved twelve-player card | ✅ |
| private league is created with a join code | ✅ |
| mobile home offers the paid entry CTA | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Live \| Leagues \| Rules \| |
| mobile checkout completes | ✅ |
| second browser cannot take over the account | ✅ |

### 3.3 Accessibility — 22/22 (`axe-results.json`)

axe-core 4.14 on 11 routes × 2 viewports (390 / 1440) against the production build: **0 violations**,
including the new paid and unpaid states.

### 3.4 Production configuration

| Check | Result |
|---|---|
| `npm run build` | ✅ clean |
| `npx tsc --noEmit` | ✅ clean |
| All 11 routes render (production server) | ✅ 200 |
| With `SESSION_SECRET` set, session + checkout work | ✅ |
| Without `SESSION_SECRET`, cookie-signing routes fail loudly | ✅ 500 `SESSION_SECRET must be set…` |

---

## 4. Evidence

Recorded on `03fa805` from a production build with an empty `.data` directory. Every screenshot in
[`screenshots/`](screenshots) is a step from the videos; [`capture-log.json`](capture-log.json) maps
each file to the URL it was taken on.

### Videos (H.264, 30 fps, constant frame rate)

| File | Length | Viewport | What it shows |
|---|---|---|---|
| [`videos/01-end-to-end-desktop.mp4`](videos/01-end-to-end-desktop.mp4) | 44 s | 1280×800 | Home → checkout (€10, receipt `TE-…-ADRE`) → Captain's Dozen → auto-pick → save → predictor → favourites auto-pick 28/28 → save picks → account → create a private league → live |
| [`videos/02-mobile-flow.mp4`](videos/02-mobile-flow.mp4) | 14 s | 390×844 | Home → checkout → receipt → auto-pick → save → account (paid entry, 6 players) |
| [`videos/03-live-simulation.mp4`](videos/03-live-simulation.mp4) | 26 s | 1280×800 | Sunday singles at 4× from `?t=2700` to the cup being decided, **Europe 16.5 – 11.5 USA** |

Frames come from the DevTools screencast and are re-timed from the real gap between repaints, so the
pacing matches the session rather than the browser's frame cadence.

### Screenshots (23)

| # | File | Step |
|---|---|---|
| 01 | `01-home.png` | Fresh visit, demo preview, `Enter · €10` |
| 02–03 | `02-checkout-empty`, `03-checkout-filled` | Paid plans, empty form, filled form |
| 04 | `04-receipt.png` | `TE-F…-ADRE` receipt, header flips to **My card** |
| 05–07 | `05-draft-empty`, `06-draft-filled`, `07-card-saved` | Captain's Dozen, auto-pick, server save |
| 08–10 | `08-predictor-empty`, `09-predictor-filled`, `10-picks-saved` | 28/28 picks, awards, saved |
| 11 | `11-account.png` | Server-backed account, 12 players, receipt |
| 12–14 | `12-leagues`, `13-league-form`, `14-league-created` | Private league with a join code |
| 15 | `15-live.png` | Live page, Friday foursomes, 0–0 |
| 16–20 | `16-mobile-home` … `20-mobile-account` | 390×844 purchase and save |
| 21–22 | `21-live-sunday`, `22-live-final` | Simulation start and decided cup |
| 23 | `23-takeover-blocked.png` | Second browser refused the existing email (409) |

---

## 5. Reproducing this run

```bash
cd adare-fantasy
npm install
rm -rf .data                       # clean server store
npm run build
SESSION_SECRET="$(openssl rand -hex 24)" npm start      # http://localhost:3000

cd verification/harness && npm install
node api.mjs                       # 17 contract checks
node record.mjs                    # desktop + mobile, frames and 20 screenshots
node record-live.mjs               # the simulation clip
node takeover.mjs                  # the blocked-takeover capture
FFMPEG=$(command -v ffmpeg) node encode.mjs
```

`BASE`, `OUT`, `CHROME_PATH`, `CHROME_LIBS` and `FFMPEG` are all overridable — see
[`harness/README.md`](harness/README.md).

## 6. Limitations of this run

- **No public deployment exists.** "Deployed" here means the production build served by
  `next start` on a Node host, not Vercel — the JSON store would not survive Vercel's ephemeral
  filesystem, and the README says so.
- **The first-tee lock is untested** end to end: `isLocked()` compares against 17 Sep 2027, so the
  423 path can only be exercised by moving the system clock.
- **Payments are simulated**; there is no Stripe integration and no card data is stored.
- The **simulation is seeded**, so every run produces the same cup — deliberate, but it means the
  videos are not a live feed.
- Accessibility is automated (axe) plus scripted keyboard checks; no screen-reader (NVDA/VoiceOver)
  session was run.
