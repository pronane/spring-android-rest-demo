# Verification report — Twenty-Eight v0.3

**Scope:** `master` at `03fa805` (the verified v0.2.2 state) plus the work from PR #6 — shared server
leagues, one-time email sign-in links, the Pinpoint side game, a pluggable live-scores adapter and CI —
landed here **without** the free-play tier, so a paid entry is still the only way in.

**Re-run:** 31 October 2026 against a production build (`next build && next start`) with an empty
store. Videos, screenshots and the harness in [`harness/`](harness) all come from that run.

**Result: 65/65 automated checks pass** — 26 API, 15 browser, 24 accessibility —
with zero console errors while recording.

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

## 2. PR #6 landed: leagues, sign-in links, Pinpoint, live feed

The branch behind PR #6 was written against `f107d9c` and conflicted with `master` in exactly one
file, `lib/store.tsx`. Resolved in favour of the paid-entry fix (a stored paid entry still outranks the
demo flag), with Pinpoint state carried alongside it.

| Feature | What it does now |
|---|---|
| **Shared private leagues** | Leagues live in the server store (`ServerLeague`), with join codes, a 20-league per-commissioner cap, 500 members max, owner hand-over on leave, and rows showing each member's projected points and prize-entry status |
| **Email sign-in links** | `POST /api/session/link` mints a 24-byte token, stores only its SHA-256 with a 15-minute expiry, and `GET /api/session/verify` spends it once and sets the session cookie. Replies are identical for known and unknown emails, and the links are never echoed in production — so clearing your browser no longer strands a paid entry |
| **Pinpoint** | Daily nearest-the-pin (feet) and longest-drive (yards) guesses, scored 10 for a perfect call minus 1 per foot / per 3 yards, saved with the card through `PUT /api/entry` |
| **Live feed adapter** | `GET /api/live` returns `{source: "simulation"}` without a provider, and validates any `LIVE_FEED_URL` JSON against the same shape the simulation uses — unknown match/player ids are dropped, and a bad feed falls back rather than blanking the page |
| **CI** | `.github/workflows/twenty-eight-ci.yml` runs `npm ci`, typecheck and build on pushes and PRs |

### Product decisions in this landing

- **No free tier.** The €0 "Free play" plan from PR #6 was removed: entry is €10 / €60 league pack /
  €24 season pass, exactly as before. Copy that implied free entry ("Play free", "Join (free) first")
  now reads "Enter · €10" / "Enter first".
- **Prize eligibility is recorded, not inferred.** Checkout writes `prizeEligible` from the plan onto
  the entry; the league tables and the account receipt read that flag instead of guessing from the
  amount paid. If a free tier ever returns, it cannot silently win prizes.
- **Header fits again.** Adding the seventh nav link pushed the header into two lines at 1280px
  (brand tagline wrapped, CTA broke). Nav spacing is now responsive, the edition chip only appears at
  2xl, and the brand, nav labels and CTA are `whitespace-nowrap` — verified from 390 to 1600px with no
  horizontal overflow.

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

## 4. Test results

### 4.1 API contract — 26/26 (`api-results.json`)

| Check | Observed |
|---|---|
| invalid email rejected | status 400 |
| account created with a session cookie | status 200 |
| takeover blocked without the session | status 409 |
| unauthenticated write rejected | status 401 |
| unpaid write rejected | status 402 |
| unknown plan rejected | status 400 |
| checkout issues a receipt ref | TE-C14EB6-ADRE |
| session cookie is httpOnly + SameSite | Path=/; Expires=Sun, 28 Feb 2027 15:40:27 GMT; Max-Age=10368000; Secure; HttpOnly; SameSite=lax |
| valid twelve-player card saves | status 200 |
| unknown match ids dropped | {"fri-am-1":"europe"} |
| invalid awards nulled | ✅ |
| unknown player id rejected | 422: Your card includes a player who is no longer in the pool. |
| wrong squad size rejected | 422: Pick 6 players — you have 7. |
| over-budget card rejected | 422: You are 0.5m over the 100m budget. |
| captain must be on the card | 422: Pick a captain from your card. |
| tampered cookie rejected | status 401 |
| session returns the saved card | 12 players |
| league creation needs a session | status 401 |
| league is created with a join code | 201 HARGV7 |
| league list includes the new league | 1 leagues |
| joining your own league is refused | 404: You're already in Harness League. |
| unknown join code is refused | 404: No league has that code. |
| leaving drops the league | status 200 |
| sign-in link does not reveal whether an email has an entry | 200 devLink=false |
| sign-in link is not echoed in production | status 200 |
| live endpoint falls back to the simulation without a feed | simulation |

### 4.2 Browser — 15/15 (`browser-results.json`)

Run against the production server with a clean database, one fresh browser profile per persona.

| Check | Observed |
|---|---|
| fresh visitor is offered a paid entry, not a card | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Pinpoint \| Liv |
| entry page lists three paid plans and no free tier | ✅ |
| checkout does not pre-fill the demo identity | ✅ |
| unpaid card cannot be saved | ✅ |
| payment issues a receipt | TE-7FF7A2-ADRE |
| header shows My card after paying | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Pinpoint \| Liv |
| paid state survives a reload | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Pinpoint \| Liv |
| twelve-player card saves | ✅ |
| predictor fills all 28 matches | 28/28 |
| picks save to the server | ✅ |
| account shows the saved twelve-player card | ✅ |
| private league is created with a join code | ✅ |
| mobile home offers the paid entry CTA | 28Twenty-EightCup fantasy · Adare 2027 \| Home \| Draft \| Predict \| Pinpoint \| Liv |
| mobile checkout completes | ✅ |
| second browser cannot take over the account | ✅ |

### 4.3 Accessibility — 24/24 (`axe-results.json`)

axe-core 4.14 on 12 routes × 2 viewports (390 / 1440) against the production build — now including
`/pinpoint`. **0 violations.**

### 4.4 Production configuration

| Check | Result |
|---|---|
| `npm run build` | ✅ clean |
| `npx tsc --noEmit` | ✅ clean |
| All 12 routes render (production server) | ✅ 200 |
| With `SESSION_SECRET` set, session + checkout work | ✅ |
| Without `SESSION_SECRET`, cookie-signing routes fail loudly | ✅ 500 `SESSION_SECRET must be set…` |

---

## 5. Evidence

Recorded on this branch from a production build with an empty `.data` directory. Every screenshot is a
step from the videos; [`capture-log.json`](capture-log.json) maps each file to the URL it was taken on.

### Videos (H.264, 30 fps, constant frame rate)

| File | Length | Viewport | What it shows |
|---|---|---|---|
| [`videos/01-end-to-end-desktop.mp4`](videos/01-end-to-end-desktop.mp4) | 46 s | 1280×800 | Home → checkout (€10, receipt) → Captain's Dozen → auto-pick → save → predictor 28/28 → save picks → account → **Pinpoint guesses saved** → private league created → live |
| [`videos/02-mobile-flow.mp4`](videos/02-mobile-flow.mp4) | 14 s | 390×844 | Home → checkout → receipt → auto-pick → save → account |
| [`videos/03-live-simulation.mp4`](videos/03-live-simulation.mp4) | 27 s | 1280×800 | Sunday singles at 4× from `?t=2700` to a decided cup |

### Screenshots (26)

| # | File | Step |
|---|---|---|
| 01 | `01-home` | Fresh visit, `Enter · €10` |
| 02–03 | `02-checkout-empty`, `03-checkout-filled` | Paid plans, empty and filled checkout |
| 04 | `04-receipt` | Receipt, header flips to **My card** |
| 05–07 | `05-draft-empty`, `06-draft-filled`, `07-card-saved` | Captain's Dozen, auto-pick, server save |
| 08–10 | `08-predictor-empty`, `09-predictor-filled`, `10-picks-saved` | 28/28 picks, awards, saved |
| 11 | `11-account` | Server-backed account, 12 players, receipt |
| 12–14 | `12-pinpoint-empty`, `13-pinpoint-guess`, `14-pinpoint-saved` | Pinpoint guesses and save |
| 15–17 | `15-leagues`, `16-league-form`, `17-league-created` | Shared league with a join code |
| 18 | `18-live` | Live page, Friday foursomes |
| 19–20 | `19-live-sunday`, `20-live-final` | Simulation start and decided cup |
| 21–25 | `21-mobile-home` … `25-mobile-account` | 390×844 purchase and save |
| 26 | `26-takeover-blocked` | Second browser refused the existing email (409) |

---

## 6. Reproducing this run

```bash
cd adare-fantasy
npm install
rm -rf .data                       # clean server store
npm run build
SESSION_SECRET="$(openssl rand -hex 24)" npm start      # http://localhost:3000

cd verification/harness && npm install
node api.mjs                       # 26 contract checks
node checks.mjs                    # 15 browser assertions
node audit.mjs                     # axe across 12 routes x 2 viewports
node record.mjs                    # desktop + mobile: frames and 23 screenshots
node record-live.mjs               # the simulation clip
node takeover.mjs                  # the blocked-takeover capture
FFMPEG=$(command -v ffmpeg) node encode.mjs
```

`BASE`, `OUT`, `CHROME_PATH`, `CHROME_LIBS` and `FFMPEG` are overridable — see
[`harness/README.md`](harness/README.md).

---

## 7. Limitations of this run

- "Deployed" means a production build on a Node host; the JSON store still will not survive a
  serverless filesystem, so this is not a Vercel deployment.
- Sign-in links are logged to the console when `RESEND_API_KEY` is unset — deliberate, so the flow is
  testable without a mail account, but it means production must set `RESEND_API_KEY` **and** `APP_URL`
  (the fallback uses the request's Host header).
- Payments are simulated; no card data is collected or stored.
- The first-tee lock (423) can only be exercised by moving the clock past 17 Sep 2027.
- Accessibility is automated (axe) plus scripted keyboard checks — no screen-reader session.
- `/api/session/link` has no rate limit yet; a production build should throttle it per email and per IP.
