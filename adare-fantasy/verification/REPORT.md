# Verification report — Twenty-Eight v0.5

**Scope:** payments and the prize ledger. Checkout now opens a pending order instead of granting an
entry; an entry exists only once that order settles (Stripe webhook, or the demo provider); every
payment writes three ledger rows; refunds reverse them; prizes settle from the table inside each pot,
and an operator console at `/admin` does all of it. The scoring engine from v0.4 is unchanged.

**Re-run:** 31 October 2026 against a production build (`next build && next start`) with an empty
store, `PAYMENTS_PROVIDER=demo` and a webhook secret set so the signature paths are exercised.

**Result: 183/183 automated checks pass** — 22 scoring rules, 47 payment and ledger
assertions, 60 API, 24 browser, 30 accessibility — with zero
console errors while recording.

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

---

## 3. This branch: payments, ledger, prizes

| Piece | What it does |
|---|---|
| `lib/server/orders.ts` | The state machine: start a checkout, settle it, fail it, refund it, apply Stripe events, settle and pay prizes |
| `lib/server/money.ts` | Cents-only maths: the 5/95 split, and the published prize split with rounding drift pushed onto first place |
| `lib/server/stripe.ts` | Checkout Session creation and `Stripe-Signature` verification (HMAC-SHA256, 5-minute tolerance), without the SDK so it is testable offline |
| `lib/server/db.ts` | Orders, ledger, prize awards and applied webhook ids, written in the same serialised transaction as the entry |
| `/api/checkout` | Creates a **pending** order and returns where to pay. Grants nothing |
| `/api/orders/:ref` · `/confirm` | Status for the payment page (owner only); the demo provider's settlement call |
| `/api/webhooks/stripe` | Signed, deduped, fails closed (503) when unconfigured |
| `/api/admin/{results,orders,prizes}` | Corrections, refunds, settlement and payout behind `ADMIN_TOKEN` |
| `/pay/:ref` | The payment page: demo button or Stripe wait, then the entry |
| `/admin` | The operator console: money, ledger, corrections, settlement |

### The invariants this landing is built around

1. **No payment, no entry.** Checkout returns a URL, not an entry. The API suite asserts that a
   pending order still gets a 402 from `PUT /api/entry`.
2. **Idempotent settlement.** Settling an already-paid order returns the same entry and writes no
   ledger rows; confirming twice from the payment page is a no-op.
3. **Refunds reverse exactly.** A refund writes three counter-rows, so gross, fees and pool all drop
   back to where they were, and the entry loses prize eligibility.
4. **Prizes are ranked inside the pot.** A league pot pays its own members; the global pot pays
   entrants who are not in a league. Ineligible entries never take a place.
5. **Signatures, not hopes.** Stale, forged and unsigned webhooks are rejected; a valid Stripe event
   still cannot settle a demo order.

### Two things this work caught

- **A league table with no viewer was empty.** `getStandings({leagueId})` needed a `me` to check
  membership, so prize settlement saw an empty field and awarded nothing. It now loads the league
  directly when there is no viewer.
- **The global pot paid people who were in a league.** The pot attribution excluded league members
  but the award ranking did not, so a league player could win the global prize. Fixed by ranking the
  eligible field per pot, and the console now shows explicit "not awarded" lines instead of silence.

---

## 4. Test results

### 4.1 Scoring rules — 22/22 (`npm run scoring:check`)

Unchanged from v0.4: captain doubling, halves, appearance points, event bonuses, the unbeaten rule and
its completeness guard, the 0.9 scale, predictor scoring, tie ranking.

### 4.2 Payments and ledger — 47/47 (`npm run payments:check`)

Signature verification (valid, tampered, wrong secret, stale, future-dated, multi-signature), the
5/95 split across all three plans, the prize split adding up to the pot for awkward values, a pending
order granting nothing, settlement writing exactly three ledger rows, repeat settlement writing none,
refunds reversing the pool, provider-mismatch webhooks being ignored, webhook dedupe, prize settlement
inside the pot, unclaimed lines, payout rows, and the refusal to re-settle a paid pot.

### 4.3 API contract — 60/60 (`api-results.json`)

| Check | Observed |
|---|---|
| invalid email rejected | status 400 |
| account created with a session cookie | status 200 |
| takeover blocked without the session | status 409 |
| unauthenticated write rejected | status 401 |
| unpaid write rejected | status 402 |
| unknown plan rejected | status 400 |
| checkout opens a pending order | 200 ORD-45A5C2 |
| checkout returns a payment url | /pay/ORD-45A5C2 |
| checkout takes no entry of its own | null |
| a pending order does not unlock the game | status 402 |
| demo payment settles the order | 200 TE-4397EE-ADRE |
| re-confirming a paid order is idempotent | alreadyPaid true |
| the owner can read the order | status 200 |
| order status needs a session | status 401 |
| an unknown order is a 404 | status 404 |
| session cookie is httpOnly + SameSite | Path=/; Expires=Sun, 28 Feb 2027 18:31:11 GMT; Max-Age=10368000; Secure; HttpOnly; SameSite=lax |
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
| league is created with a join code | 201 HARU6G |
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
| a webhook with no signature is refused | status 400 |
| a replayed webhook is refused | status 400 |
| a valid webhook cannot settle a demo order | 200 ignored order belongs to the demo provider |
| a forged signature is refused | status 400 |
| the ledger knows what was taken and what was pooled | gross 1000, fee 50, pool 950 |
| the order list shows the settled order | 1 orders |
| the prize board starts from the paid pot | pot 950 |
| settling awards the podium from the table | 200 1 awards 950 |
| no award is larger than the pot | awards inside the pot |
| prizes can be marked paid | 1 paid |
| a paid pot cannot be settled twice | status 409 |
| a season pass costs €24 and pools 95% | 2400 cents |
| an operator can refund an order | 200 refunded |
| a refund comes back out of the pool | gross 1000 |

### 4.4 Browser — 24/24 (`browser-results.json`)

One fresh profile per persona against the production server and a clean database.

| Check | Observed |
|---|---|
| fresh visitor is offered a paid entry, not a card | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| Predi |
| entry page lists three paid plans and no free tier | ✅ |
| checkout does not pre-fill the demo identity | ✅ |
| unpaid card cannot be saved | ✅ |
| the payment page issues an entry ref | TE-9F7DBC-ADRE |
| paying lands on a settled order | ✅ |
| header shows My card after paying | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| Predi |
| paid state survives a reload | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| Predi |
| twelve-player card saves | ✅ |
| predictor fills all 28 matches | 28/28 |
| picks save to the server | ✅ |
| account shows the saved twelve-player card | ✅ |
| private league is created with a join code | ✅ |
| mobile home offers the paid entry CTA | 28Twenty-EightCup fantasy · Adare 2027 \| HomeHome \| DraftDraft \| Predi |
| mobile checkout completes | ✅ |
| table lists the saved card with a rank | Skip to content / 28 / Twenty-Eight |
| table shows a scored total | 449.0, 16.5, 11.5 |
| account shows the server-side points breakdown | ✅ |
| second browser cannot take over the account | ✅ |
| a blocked takeover never reaches the payment page | http://127.0.0.1:3000/enter |
| the console asks for the admin token | ✅ |
| the console shows the money taken | ✅ |
| the console lists the settled orders | ✅ |
| the console can open the results tab | ✅ |

### 4.5 Accessibility — 30/30 (`axe-results.json`)

axe-core 4.14 on 15 routes × 2 viewports (390 / 1440), including `/admin` and a payment page in its
error state. **0 violations.**

### 4.6 Production configuration

| Check | Result |
|---|---|
| `npm run build` | ✅ clean |
| `tsc --noEmit` | ✅ clean |
| `npm run scoring:check` / `payments:check` | ✅ 22/22 · 47/47 |
| All 15 routes render | ✅ 200 |
| Without `ADMIN_TOKEN`, admin endpoints refuse | ✅ 503 |
| Without `STRIPE_WEBHOOK_SECRET`, the webhook refuses | ✅ 503 |
| With a secret, forged and replayed webhooks are refused | ✅ 400 |
| With a secret, a demo order still cannot be settled by Stripe | ✅ 200 `ignored` |
| A pending order cannot save a card | ✅ 402 |

---

## 5. Evidence

### The film

[`demo/twenty-eight-start-to-finish.webm`](../demo/twenty-eight-start-to-finish.webm) — **2:48,
1440×900 VP9, captions burned in** — is the whole product in one sitting: a paid entry, a drafted
Captain's Dozen, 28 predictions, Pinpoint guesses, the points breakdown, the global table, a private
league, Sunday singles finishing the cup, and an operator settling that league's prize pot. Recorded
by [`demo/record-tour.mjs`](../demo/record-tour.mjs) against this build and rendered by
[`demo/render-tour.mjs`](../demo/render-tour.mjs); [`demo/stills/`](../demo/stills) holds one frame per
step from the same run. The console's pot picker was added because the film exposed a real gap: the
API could settle a league pot but the page only offered the global one.

### Screenshots and clips

Recorded on this branch from a production build with an empty `.data` directory.
[`capture-log.json`](capture-log.json) maps the 30 recorded steps to the URL each was taken on; the
last three shots come from the live-simulation and takeover scripts.

### Videos (H.264, 30 fps, constant frame rate)

| File | Length | Viewport | What it shows |
|---|---|---|---|
| [`videos/01-end-to-end-desktop.mp4`](videos/01-end-to-end-desktop.mp4) | 50 s | 1280×800 | Home → entry → **payment page** → paid → Captain's Dozen → predictor 28/28 → account → table → Pinpoint → league → live |
| [`videos/02-mobile-flow.mp4`](videos/02-mobile-flow.mp4) | 17 s | 390×844 | Home → entry → payment → draft → account on a phone |
| [`videos/03-live-simulation.mp4`](videos/03-live-simulation.mp4) | 23 s | 1280×800 | Sunday singles at 4× from `?t=2700` to a decided cup |
| [`videos/04-operator-console.mp4`](videos/04-operator-console.mp4) | 10 s | 1280×900 | `/admin`: connect, read the ledger, settle the global pot, check corrections |

### Screenshots (33)

| # | Step | # | Step |
|---|---|---|---|
| 01 | Home, `Enter · €10` | 18 | League form |
| 02–03 | Entry page, empty and filled | 19 | League created with a join code |
| 04 | **Payment page**, pending demo order | 20 | Live page |
| 05 | **Paid**: entry ref, next steps | 21–26 | Mobile: home, entry, **payment**, paid, draft, account |
| 06–08 | Draft, auto-pick, card saved | 27 | **Console**: money and orders |
| 09–11 | Predictor, 28/28 picks, saved | 28 | **Console**: prizes before settlement |
| 12 | Account with the points breakdown | 29 | **Console**: pot settled, with unclaimed lines |
| 13 | The table | 30 | **Console**: results corrections |
| 14–16 | Pinpoint guesses and save | 31–32 | Live simulation start and decided cup |
| 17 | Leagues | 33 | Takeover blocked (409) |

---

## 6. Reproducing this run

```bash
cd adare-fantasy
npm install
npm run scoring:check && npm run payments:check   # 22 + 47 assertions, no server
rm -rf .data
npm run build
SESSION_SECRET="$(openssl rand -hex 24)" \
ADMIN_TOKEN="$(openssl rand -hex 24)" \
STRIPE_WEBHOOK_SECRET="$(openssl rand -hex 24)" \
PAYMENTS_PROVIDER=demo npm start

cd verification/harness && npm install
ADMIN_TOKEN=… STRIPE_WEBHOOK_SECRET=… node api.mjs   # 60 contract checks
node checks.mjs                                       # 24 browser assertions
node audit.mjs                                        # axe, 15 routes x 2 viewports
node record.mjs && node record-live.mjs && node takeover.mjs
FFMPEG=$(command -v ffmpeg) node encode.mjs
```

With real keys, drop `PAYMENTS_PROVIDER=demo` and set `STRIPE_SECRET_KEY`; checkout then redirects to
Stripe and the payment page waits for the webhook.

---

## 7. Limitations of this run

- **The demo provider is a button.** It runs the real settlement function, but no money moves. Stripe
  keys flip the same code path onto a hosted session; that path is unit-tested rather than
  live-tested, because this environment cannot reach Stripe.
- **The Stripe client is hand-rolled.** `lib/server/stripe.ts` covers Checkout Sessions and signature
  verification; a production deployment should use the official SDK for retries, idempotency and
  versioning, and should use Stripe Tax and Radar.
- **Prizes are computed inside the pot** but "Best single session" is not settled yet — per-session
  points are not stored, so that line is reported as unclaimed rather than guessed.
- **The store is still a JSON file.** A settlement is one serialised write, but production needs
  Postgres so a crash between the payment and the entry is impossible.
- Results still come from the seeded simulation; the live adapter is wired but has no provider.
- Accessibility is automated (axe) plus scripted keyboard checks — no screen-reader session.
