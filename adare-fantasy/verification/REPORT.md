# Verification report — Twenty-Eight v0.2.2

**Scope:** review and test `master` at `f107d9c` (merge of PR #3, *"fix account takeover, server-side
card validation, demo 'paid' state"*), then run an end-to-end verification of the app served from a
production build (`next build && next start`).

**Date:** 31 October 2026 · **Runner:** headless Chromium 141 via Puppeteer, axe-core 4.14, Node 22

**Result: 58/58 automated checks pass** — 17 API, 19 browser, 22 accessibility — after fixing two
regressions found during the review. Evidence is in [`screenshots/`](screenshots) and
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

| Check | Expected | Result |
|---|---|---|
| Invalid email rejected | 400 | ✅ |
| Account created, session cookie issued | 200 + `signedIn` | ✅ |
| Existing email without its session (takeover) | **409** | ✅ |
| Existing email *with* its own session | 200 | ✅ |
| Card write without a session | 401 | ✅ |
| Card write before paying | 402 | ✅ |
| Unknown checkout plan | 400 | ✅ |
| Checkout records a paid entry + `TE-XXXXXX-ADRE` | 200 | ✅ |
| Valid Captain's Dozen saves | 200 | ✅ |
| Bogus match ids / pick values dropped | sanitised | ✅ |
| Unknown player ids nulled in awards | sanitised | ✅ |
| 7 players in Classic Six | 422 | ✅ |
| 100.5m card on a 100m budget | 422 `You are 0.5m over the 100m budget` | ✅ |
| Captain not in the squad | 422 | ✅ |
| Six USA players (one-sided card) | 422 | ✅ |
| Tampered session cookie | 401 | ✅ |
| Session returns the saved card | 12 players, captain set | ✅ |

### 3.2 Browser end-to-end — 19/19 (`browser-results.json`)

Run against the production server (`next start`) with a clean database.

| Check | Result |
|---|---|
| Fresh visitor sees the demo card, not a paid account | ✅ header CTA "Enter · €10" |
| Fresh visitor gets the checkout form, not a receipt | ✅ |
| Checkout is **not** pre-filled with the demo identity | ✅ empty manager field (new) |
| Unpaid draft offers entry instead of save | ✅ "Enter €10 to save" |
| Checkout returns a receipt | ✅ `TE-CFF87A-ADRE` |
| **The paid entry survives a reload** | ✅ header CTA "My card" (regression fix) |
| Captain's Dozen auto-picks a legal 12 | ✅ 12/12, within budget |
| Card saves to the server | ✅ "Card saved ✓" |
| Predictor fills all 28 matches | ✅ 28/28 |
| Picks save to the server | ✅ "Picks saved ✓" |
| Account shows the saved card | ✅ 12 players, server-side |
| Account shows the paid receipt | ✅ same reference |
| Desktop flow recorded | ✅ 859 frames |
| Live clock advances while playing | ✅ |
| Live flow recorded | ✅ 317 frames |
| Mobile checkout completes | ✅ receipt on a 390px viewport |
| Mobile account reads the paid session | ✅ manager name from the server |
| Mobile flow recorded | ✅ 112 frames |
| A second browser cannot claim an existing email | ✅ 409 shown as an alert |

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

### Videos (1280×800 unless noted, H.264, 30 fps)

| File | Length | What it shows |
|---|---|---|
| [`videos/01-end-to-end-desktop.mp4`](videos/01-end-to-end-desktop.mp4) | 35 s | Home → checkout → receipt → Captain's Dozen auto-pick → save → predictor 28/28 → save picks → account → create a league |
| [`videos/02-live-simulation.mp4`](videos/02-live-simulation.mp4) | 18 s | Sunday singles at 4× from `?t=2700`, clock and cup score moving, jump to the final putt |
| [`videos/03-mobile-flow.mp4`](videos/03-mobile-flow.mp4) | 13 s | 390×844: home → auto-pick → checkout → receipt → account |

### Screenshots (21)

| # | File | Step |
|---|---|---|
| 01–03 | `fresh-home`, `fresh-enter`, `fresh-draft` | First visit: demo preview, unpaid state, entry CTA |
| 04–07 | `desktop-home`, `desktop-enter`, `desktop-enter-filled`, `desktop-receipt` | Purchase flow |
| 08–09 | `desktop-draft-dozen`, `desktop-draft-saved` | Captain's Dozen auto-pick and server save |
| 10–13 | `desktop-predict`, `desktop-picks-saved`, `desktop-account`, `desktop-leagues` | Predictor, server-backed account, league creation |
| 14–16 | `live-singles-start`, `live-singles-playing`, `live-final` | Live simulation playback |
| 17–20 | `mobile-home`, `mobile-draft`, `mobile-receipt`, `mobile-account` | Mobile pass |
| 21 | `takeover-blocked` | Second browser refused the existing email (409) |

---

## 5. Reproducing this run

```bash
cd adare-fantasy
npm install
rm -rf .data                      # clean server store
npm run build
SESSION_SECRET="$(openssl rand -hex 24)" npm start   # http://localhost:3000

# then, from the harness used for this report:
node api-test.mjs                 # 17 API checks
node flows.mjs                    # 19 browser checks + video frames
node audit.mjs                    # axe-core across 11 routes x 2 viewports
node encode.mjs                   # frames -> mp4
```

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
