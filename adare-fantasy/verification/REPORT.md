# Verification report — Twenty-Eight v0.4

**Scope:** the scoring engine. Points are now computed on the server from a results snapshot, the
table exists at `/leaderboard`, the account shows the working, and an operator can correct a match, an
event or an award without touching the store. Everything shipped earlier — paid entry, shared leagues,
sign-in links, Pinpoint, the live adapter — behaves as it did.

**Re-run:** 31 October 2026 against a production build (`next build && next start`) with an empty
store. Videos, screenshots and the harness in [`harness/`](harness) all come from that run.

**Result: 104/104 automated checks pass** — 38 API, 18 browser,
26 accessibility, 22 scoring rules — with zero console errors while recording.

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

---

## 2. Landed earlier: leagues, sign-in links, Pinpoint, live feed

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

---

## 3. This branch: the scoring engine

| Piece | What it does |
|---|---|
| `lib/scoring.ts` | Pure engine: `scoreCard`, `scorePredictions`, `scoreEntry`, `rankRows`. No I/O, no React, so it is tested directly and reused by every surface |
| `lib/server/results.ts` | Builds the results snapshot: 28 finals from the seeded simulation, merged with operator corrections from the store |
| `lib/server/standings.ts` | Scores every card and ranks it; powers the global table, league tables and the account breakdown |
| `/api/leaderboard` | Global table, or `?league=<id>` for a league you belong to (404 otherwise) |
| `/api/score` | The signed-in entry's breakdown: card points, prediction points, per-player rows |
| `/api/admin/results` | `GET` / `POST` / `DELETE` corrections, bearer `ADMIN_TOKEN`, constant-time compare, **503 when unconfigured** so it fails closed |
| `/leaderboard` | Global and per-league tabs, re-scores every 30 s, prize badges, "you" row, and a note on where the results came from |

### Rules, and where they are enforced

| Rule | Value |
|---|---|
| Foursomes / fourball win · half | 5 · 2.5 |
| Singles win · half | 6 · 3 |
| Appearance | +1 per completed match |
| Birdie · eagle · albatross | +1 · +4 · +8 |
| Unbeaten, 3+ matches, cup complete | +5 |
| Captain | match points doubled |
| Twelve-man cards | total × 0.9, so both modes share one leaderboard |
| Predictor | +2 per match, +5 per award, +10 exact scoreline (only once the cup is decided) |
| Ranking | ties share a rank, the next entry skips |

### Two bugs this work surfaced

1. **Sign-in tokens were printed in production.** Without `RESEND_API_KEY`, `sendEmail` logged the whole
   message, including a live 15-minute sign-in URL. Production now logs a redacted line; only
   development prints the link.
2. **The rules had drifted from the simulator.** The simulation's unbeaten bonus needs three matches and
   a completed cup; an early cut of the engine used two matches and paid immediately, which would have
   inflated every table. The engine now mirrors the simulator and `scripts/scoring-check.ts` pins both
   facts.

---

## 4. Test results

### 4.1 Scoring rules — 22/22 (`npm run scoring:check`)

Runs in CI before the build. Covers captain doubling, halved matches, appearance points, event bonuses,
the unbeaten rule and its completeness guard, the 0.9 scale, prediction scoring, the mid-event
exact-scoreline guard, unknown players, empty cards and tie ranking.

### 4.2 API contract — 38/38 (`api-results.json`)

| Check | Observed |
|---|---|
| invalid email rejected | status 400 |
| account created with a session cookie | status 200 |
| takeover blocked without the session | status 409 |
| unauthenticated write rejected | status 401 |
| unpaid write rejected | status 402 |
| unknown plan rejected | status 400 |
| checkout issues a receipt ref | TE-2E6996-ADRE |
| session cookie is httpOnly + SameSite | Path=/; Expires=Sun, 28 Feb 2027 17:35:12 GMT; Max-Age=10368000; Secure; HttpOnly; SameSite=lax |
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
| league is created with a join code | 201 HAR6BK |
| league list includes the new league | 1 leagues |
| joining your own league is refused | 404: You're already in Harness League. |
| unknown join code is refused | 404: No league has that code. |
| leaving drops the league | status 200 |
| sign-in link does not reveal whether an email has an entry | 200 devLink=false |
| sign-in link is not echoed in production | status 200 |
| live endpoint falls back to the simulation without a feed | simulation |
| score endpoint needs a session | status 401 |
| score returns a breakdown for the saved card | total 314.3 |
| global table scores every card server-side | 1 rows |
| global table ranks in order | [314.3] |
| results snapshot covers the whole cup | 28/28 |
| card and predictor add up to the total | row totals consistent |
| league table only scores that league | 1 rows |
| league you are not in is refused | status 404 |
| admin corrections reject a bad token | status 401 |
| operator correction applies and drops unknown matches | applied 1, dropped ["ghost-match"] |
| table re-scores from the correction | mixed |
| clearing corrections returns to the simulation | simulation |

### 4.3 Browser — 18/18 (`browser-results.json`)

One fresh profile per persona against the production server and a clean database.

| Check | Observed |
|---|---|
| fresh visitor is offered a paid entry, not a card | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| PredictPredict  |
| entry page lists three paid plans and no free tier | ✅ |
| checkout does not pre-fill the demo identity | ✅ |
| unpaid card cannot be saved | ✅ |
| payment issues a receipt | TE-844A5C-ADRE |
| header shows My card after paying | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| PredictPredict  |
| paid state survives a reload | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| PredictPredict  |
| twelve-player card saves | ✅ |
| predictor fills all 28 matches | 28/28 |
| picks save to the server | ✅ |
| account shows the saved twelve-player card | ✅ |
| private league is created with a join code | ✅ |
| mobile home offers the paid entry CTA | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| PredictPredict  |
| mobile checkout completes | ✅ |
| table lists the saved card with a rank | Skip to content / 28 / Twenty-Eight |
| table shows a scored total | 449.0, 16.5, 11.5 |
| account shows the server-side points breakdown | ✅ |
| second browser cannot take over the account | ✅ |

### 4.4 Accessibility — 26/26 (`axe-results.json`)

axe-core 4.14 on 13 routes × 2 viewports (390 / 1440), `/leaderboard` included. **0 violations.**

### 4.5 Production configuration

| Check | Result |
|---|---|
| `npm run build` | ✅ clean |
| `tsc --noEmit` | ✅ clean |
| `npm run scoring:check` | ✅ 22/22 |
| All 13 routes render | ✅ 200 |
| With `SESSION_SECRET`, session + checkout work | ✅ |
| Without `SESSION_SECRET`, cookie-signing routes fail loudly | ✅ 500 |
| Without `ADMIN_TOKEN`, corrections are refused | ✅ 503 |
| With `ADMIN_TOKEN`, a correction re-scores the table | ✅ `mixed` → `simulation` round-trip |

---

## 5. Evidence

Recorded on this branch from a production build with an empty `.data` directory. Every screenshot is a
step from the videos; [`capture-log.json`](capture-log.json) maps each file to the URL it was taken on.

### Videos (H.264, 30 fps, constant frame rate)

| File | Length | Viewport | What it shows |
|---|---|---|---|
| [`videos/01-end-to-end-desktop.mp4`](videos/01-end-to-end-desktop.mp4) | 49 s | 1280×800 | Home → checkout (€10, receipt) → Captain's Dozen → auto-pick → save → predictor 28/28 → save picks → account (points) → **the table** → Pinpoint → league created → live |
| [`videos/02-mobile-flow.mp4`](videos/02-mobile-flow.mp4) | 14 s | 390×844 | Home → checkout → receipt → auto-pick → save → account |
| [`videos/03-live-simulation.mp4`](videos/03-live-simulation.mp4) | 25 s | 1280×800 | Sunday singles at 4× from `?t=2700` to a decided cup |

### Screenshots (27)

| # | File | Step |
|---|---|---|
| 01 | `01-home` | Fresh visit, `Enter · €10` |
| 02–03 | `02-checkout-empty`, `03-checkout-filled` | Paid plans, empty and filled checkout |
| 04 | `04-receipt` | Receipt, header flips to **My card** |
| 05–07 | `05-draft-empty`, `06-draft-filled`, `07-card-saved` | Captain's Dozen, auto-pick, server save |
| 08–10 | `08-predictor-empty`, `09-predictor-filled`, `10-picks-saved` | 28/28 picks, awards, saved |
| 11 | `11-account` | Account with the server-side points breakdown |
| 12 | `12-leaderboard` | **The table**: rank, card, picks, total, prize badge |
| 13–15 | `13-pinpoint-empty`, `14-pinpoint-guess`, `15-pinpoint-saved` | Pinpoint guesses and save |
| 16–18 | `16-leagues`, `17-league-form`, `18-league-created` | Shared league with a join code |
| 19 | `19-live` | Live page, Friday foursomes |
| 20–21 | `20-live-sunday`, `21-live-final` | Simulation start and decided cup |
| 22–26 | `22-mobile-home` … `26-mobile-account` | 390×844 purchase and save |
| 27 | `27-takeover-blocked` | Second browser refused the existing email (409) |

---

## 6. Reproducing this run

```bash
cd adare-fantasy
npm install
npm run scoring:check                 # 22 rule assertions, no server needed
rm -rf .data
npm run build
SESSION_SECRET="$(openssl rand -hex 24)" ADMIN_TOKEN="$(openssl rand -hex 24)" npm start

cd verification/harness && npm install
ADMIN_TOKEN=… node api.mjs            # 38 contract checks
node checks.mjs                       # 18 browser assertions
node audit.mjs                        # axe across 13 routes x 2 viewports
node record.mjs && node record-live.mjs && node takeover.mjs
FFMPEG=$(command -v ffmpeg) node encode.mjs
```

---

## 7. Limitations of this run

- Results come from the seeded simulation; the live adapter is wired but has no provider behind it, so
  the table shows a completed cup rather than a moving one.
- Corrections live in the JSON store, so they are per-process like the rest of it — Postgres is the
  production answer.
- One global table rather than per-mode tables; the 0.9 scale keeps six- and twelve-man cards comparable
  instead.
- Payments are still simulated; sign-in links need `RESEND_API_KEY` and `APP_URL` in production.
- Accessibility is automated (axe) plus scripted keyboard checks — no screen-reader session.
