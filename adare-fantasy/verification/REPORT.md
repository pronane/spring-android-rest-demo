# Verification report — Twenty-Eight v0.8

**Scope (v0.8):** installers for macOS/Linux and Windows, a Postgres backend with a schema and
migrations, one command that starts everything, and a browser test that clicks through the whole
product. The v0.7 sign-in work — **Google, Apple and Facebook sign-in** on top of the existing
email/magic-link accounts, without introducing a second notion of an account. Everything v0.6 shipped
(scoring, transfers, armband, sharing, invites, payments) is unchanged and still covered by its suite.

**Re-run:** 1 November 2026 against a production build (`next build && next start`) with an empty
store, `PAYMENTS_PROVIDER=demo` and a webhook secret set so the signature paths are exercised. The
provider-facing checks run twice: once with **no** provider credentials (the shipped default — every
social button must be absent and every endpoint must fail closed) and once with dummy Google, Apple
and Facebook credentials, for the redirect, cookie and screenshot evidence.

**Result: 391/391 automated checks pass** — 55 scoring rules, 47 payment and ledger assertions, 79
sign-in assertions, 27 Postgres assertions, 93 API, 32 browser, 34 accessibility, 9 on the card
clock, and 15 end-to-end browser steps — with zero console errors while recording.

---

## 0a. What v0.8 changed

| Strand | What it means | Where |
|---|---|---|
| **Installers** | `install.sh` (macOS/Linux) and `install.ps1` (Windows) check for Node 20+, download a verified private copy if it is missing, then hand over to one shared installer: dependencies, database, `.env.local`, browser, build, smoke test. No sudo, no UAC, nothing system-wide. | `install.sh`, `install.ps1`, `scripts/install.mjs` |
| **Postgres, optionally** | `DATABASE_URL` selects the tables in `db/schema.sql`; unset keeps the JSON file. `db:migrate` applies the schema (and `db/migrations/*.sql`) and records checksums. The bundled binaries are npm packages, so `db:local` can create a cluster in `.data/pg` with no admin rights on macOS, Linux and Windows. | `db/schema.sql`, `lib/server/store-pg.ts`, `scripts/{db-migrate,local-db}.mjs` |
| **One start command** | `start.sh` / `start.cmd` read `.env.local`, start the local cluster if it is the configured store, build if there is no build, wait for a real answer, print the URLs, and can run the end-to-end test before handing over. | `scripts/start.mjs`, `start.sh`, `start.cmd` |
| **End-to-end in a browser** | `npm run e2e`: 15 steps from a paid entry to signing back in with a one-time link, including drafting by hand and calling all 28 matches. Starts its own server on a clean store; `--headed` to watch, `--shots` for a picture per step. | `scripts/e2e.mjs`, `scripts/browser.mjs` |
| **A local inbox** | `MAIL_OUTBOX` writes every email to a folder as JSON, so a production build can run the sign-in flow without a mail provider — and the e2e test can read the link it "sent". | `lib/server/mail.ts` |

### The invariants this landing is built around

1. **The two backends cannot drift.** `db.ts` still owns every rule and reads one document;
   `store-pg.ts` only moves that document in and out of eight tables, in one transaction under an
   advisory lock. The API suite (93 checks) and the browser suite (32) run green against both, and
   `db:check` drives the store functions directly against a real cluster.
2. **Installing changes nothing outside the project and the user's own directories**, and every step
   is idempotent — `--check` reports without writing, and running the installer twice is a no-op.
3. **The download is verified.** Node tarballs are checked against the published `SHASUMS256.txt`
   before they are unpacked; a mismatch aborts.
4. **The end-to-end test is the installer's proof, not a demo.** It runs in CI on every push, on a
   clean store, and fails with the step name, the reason and a screenshot of the screen it was on.

### Verified here, and not

- Linux x64 (Ubuntu 22.04, Node 22): the installer from an empty `.data`/`.next`/`.env.local`, then
  `start.sh --e2e` — 15/15 against Postgres and 15/15 against the JSON file; `db:check` 27/27.
- macOS and Windows: the same code paths and the same scripts, with the platform's own Postgres
  binaries and browser discovery. **Not executed on those operating systems in this environment** —
  `INSTALL.md` says so in the table at the bottom rather than implying otherwise.

---
## 0. What v0.7 changed

| Strand | What it means | Where |
|---|---|---|
| **Three providers, one flow** | Authorisation-code + PKCE (S256), a signed single-use state cookie (`te_oauth`, 600 s, httpOnly, SameSite=Lax) carrying the verifier and nonce, and an ID token whose signature is checked against the provider's JWKS before any claim is believed. | `lib/server/oauth.ts`, `app/api/auth/[provider]/{start,callback}/route.ts` |
| **One account per email** | A provider identity is stored on the user (`User.identities`). A known (provider, subject) signs in; a signed-in browser links the provider to that account; otherwise a **verified** email that already exists signs into that entry and links; anything else creates the account. An identity held elsewhere, or a mid-session account switch, is refused. | `lib/server/db.ts` (`findUserByIdentity`, `linkIdentity`), `signInWithIdentity` |
| **Off until configured** | `/api/auth/providers` lists only providers with complete credentials; `components/SocialSignIn.tsx` draws only what that endpoint returns. A clone with no `.env.local` shows no social buttons at all. | `app/api/auth/providers/route.ts`, `components/SocialSignIn.tsx` |
| **Apple done properly** | No static client secret: an ES256 JWT minted from `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` (≤ 6 months), `response_mode=form_post` accepted on a POST callback, and the name Apple posts once used when the token carries none. | `appleClientSecret()`, callback route |
| **Facebook's weaker signal** | Facebook returns a Graph profile, not an ID token, so the access token is only believed after `debug_token` confirms it was minted for this app. | `facebookProfile()` |
| **Tested rules** | `npm run oauth:check`: provider gating, PKCE, state signing/tampering/expiry, RSA + ES256 token verification (`aud`, `iss`, `exp`, skew, `nonce`, `alg=none`, unknown key), Apple's secret, redirect clamping, and every branch of account linking against a throwaway store. | `scripts/oauth-check.ts` |

### The invariants this landing is built around

1. **A paid entry is never silently swapped.** Signing in as someone else while already signed in is
   refused with a reason; the identity is not moved.
2. **An unverified email signs nobody in.** `email_verified` must be true before the address is used
   to find or create an entry — otherwise "sign in with any email" would be a takeover route.
3. **No token, code or verifier ever reaches the browser.** The state cookie is httpOnly; PKCE is
   server-side; the callback sets the same `te_session` cookie the magic link uses, so checkout,
   transfers and the paid gate are unchanged.
4. **A failure is a page, not a stack trace.** Every failure path redirects to
   `/account?signin=error&reason=…` and signs nothing in.

### Three things this work caught

- **A state token could have doubled as a session.** The first cut signed the state with the session
  key. Deriving a separate key (`HMAC(secret, "oauth-state")`) means a stolen state cookie cannot be
  replayed as `te_session`; `oauth-check` asserts the two deployments' secrets and tampering cases.
- **`next` was an open redirect.** `?next=https://evil.example` survived the first implementation.
  It is now clamped by `safeNext()` — paths only, `//host` and `/\host` rejected — and tested.
- **Facebook has no verifiable ID token here.** Believing the `me` response alone would let a token
  minted for another app sign in; `debug_token` is checked against `FACEBOOK_APP_ID` first.

---

## 0. What v0.6 changed

| Strand | What it means | Where |
|---|---|---|
| **Server scoring** | A results snapshot is the matches **finished at a given minute**; the clock is server-side and can follow real time (`SCORING_CLOCK=live`), a replay (`at:<minute>`) or a single request (`?at=`). Partial tables are labelled provisional with the session and matches in play. | `lib/server/clock.ts`, `lib/server/results.ts`, `app/api/{leaderboard,score}/route.ts` |
| **Feed on the server** | The provider feed is fetched once per 20 s and overlaid on the pairings, so the table, leagues, share cards and API all score the same finals. A broken feed still falls back to the simulation. | `lib/server/feed.ts`, `lib/server/results.ts`, `app/api/live/route.ts` |
| **Transfers** | Two free changes after the lock, then −4 points each; possible only in the pre-tee and overnight windows; every swap re-checked on the server against budget and side limits and recorded with its window and price. | `lib/transfers.ts`, `lib/server/transfers.ts`, `app/api/entry/transfer/route.ts`, `app/team/transfers` |
| **Armband by day** | A captain per day (Fri/Sat/Sun) doubles that day's match points only; the overall captain remains the fallback, so older cards score unchanged; the breakdown reports what the doubling was worth. | `lib/scoring.ts` (`scoreCard`), `app/team/transfers` |
| **Sharing and growth** | A public card at `/t/<entry ref>` with a generated OG image, copy/WhatsApp/X buttons, and an invite code that *is* the entry ref: both cards get one extra free transfer when the invitee's order settles. | `app/t/[ref]/`, `components/ShareButtons.tsx`, `lib/server/db.ts` (`grantReferral`) |


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

### 4.1 Scoring rules — 55/55 (`npm run scoring:check`)

The v0.4 rules (captain doubling, halves, appearance points, event bonuses, the unbeaten rule and its
completeness guard, the 0.9 scale, predictor scoring, tie ranking) plus 33 assertions for v0.6: the
per-day armband (including an explicit null day and the fallback to the overall captain), the captain
bonus that is reported, transfer penalties taken off the total rather than the card, the three
windows and the closed gaps between them, the free allowance and what a referral adds, refusal of a
swap during play / for an unknown player / over budget, and the clock in all three modes.

### 4.2 Payments and ledger — 47/47 (`npm run payments:check`)

Signature verification (valid, tampered, wrong secret, stale, future-dated, multi-signature), the
5/95 split across all three plans, the prize split adding up to the pot for awkward values, a pending
order granting nothing, settlement writing exactly three ledger rows, repeat settlement writing none,
refunds reversing the pool, provider-mismatch webhooks being ignored, webhook dedupe, prize settlement
inside the pot, unclaimed lines, payout rows, and the refusal to re-settle a paid pot.

### 4.3 API contract — 93/93 (`api-results.json`)

The 60 checks from v0.5 plus 26 for this landing: the transfer page needs a session; the saved card
comes back with the rules attached; a replacement is offered for every player; the armband must be on
the card and can be set per day (and is scored, with the doubling reported); an unknown player is
refused; a legal swap changes the squad, is free before the first tee and is recorded with its
window; the same player cannot be swapped out twice; invite codes are entry refs; an invited player
and the inviter each get one extra free transfer, once; an invented code is 404; a public card renders
with OG tags and a real PNG image, and an unknown card is 404; `?at=600` scores 8 matches as
provisional with the session named, and `?at=0` scores nobody.

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

### 4.4 Browser — 32/32 (`browser-results.json`)

The 24 checks from v0.5 plus 11 for this landing: the transfer page opens for a saved card, shows the
window and allowance, offers replacements, completes a swap through the UI ("Done — that change was
free"), lands it in the history, and sets the armband per day; the account page offers the share card
and explains the invite; the public card renders on its own URL with points and a rank and an entry
CTA.

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

### 4.5 Accessibility — 34/34 (`axe-results.json`)

axe-core 4.14 on 17 routes × 2 viewports (390 / 1440), including `/admin`, a payment page in its
error state, `/team/transfers` (signed out and signed in) and a real public card seeded through the
API. **0 violations.** Two were caught by this sweep and fixed: the signed-out transfers page had no
`h1`, and the footer note on a public card was 4.06:1.

### 4.6 The card clock — 9/9 (`clock.mjs`)

The suites above run against the demo clock, which sits before the first tee, where changes are free
by design. To cover the other half of the transfer rules the same build was started with
`SCORING_CLOCK=at:600` — Friday night — and `clock.mjs` checked: the window opens, two changes are
free, the third costs four points, the allowance reports zero left with a cost of four, all three
swaps appear in the history with their price, the penalty comes off the score's total rather than the
card (gross 62 → net 58), the table row carries `penalty: 4`, and the snapshot scores only the eight
matches finished by minute 600 and labels itself provisional.

```bash
SCORING_CLOCK=at:600 npm start          # in adare-fantasy/
node verification/harness/clock.mjs     # 9 checks
```

### 4.7 Social sign-in — 79/79 (`npm run oauth:check`)

Run with no server and no provider: keys are generated in-process, tokens are hand-signed, and the
account store is a throwaway `DB_FILE`.

| Group | Assertions | Covers |
|---|---|---|
| Provider gating | 7 | Nothing offered without credentials; half-configured providers hidden; Apple needs all four values; `\n` unescaped in the key |
| Redirects | 10 | Per-provider callback path, trailing slash, `response_type=code`, `code_challenge_method=S256`, state/nonce carried, Google `prompt=select_account`, Apple `response_mode=form_post` |
| PKCE | 3 | `base64url(SHA-256(verifier))`, no padding, 43+ characters, uniqueness |
| `next` clamping | 6 | Paths honoured, absolute and protocol-relative URLs refused, backslash trick refused |
| State cookie | 7 | Round-trip, missing, tampered body, tampered signature, wrong secret, expired, junk |
| ID tokens | 15 | RSA and ES256 signatures, wrong key, `alg=none`, unknown `kid`, audience (scalar and list), issuer, expiry, 120 s skew, future `iat`, nonce, missing subject |
| Apple secret | 6 | ES256, key id, team, client id, audience, ≤ six months |
| `email_verified` | 4 | Google's `true` and Apple's `"true"` both count; `"false"` and missing do not |
| Account linking | 21 | Create / repeat / unverified refused / junk email / second provider links / unknown email links to the entry / identity not moved / signed-in browser links / manager name from email |

The API suite adds six more against a running server in its shipped (unconfigured) state:

| Check | Result |
|---|---|
| The provider list answers with an array | ✅ 200, 0 enabled |
| Every offered provider has a button label | ✅ none configured |
| An unknown provider cannot be started | ✅ 404 |
| An unconfigured provider cannot be started | ✅ 404, no state cookie |
| Its callback lands on the account page with a reason | ✅ 303 `?signin=error&reason=…` |
| A callback with no state or code fails closed | ✅ 303 `?signin=error` |

### 4.8 The Postgres backend — 27/27 (`npm run db:check`)

Builds a throwaway cluster from the bundled binaries, applies `db/schema.sql`, points the app at it,
and drives `lib/server/db.ts` the way the API routes do. Then it reads the tables themselves.

| Group | Assertions | Covers |
|---|---|---|
| Schema | 3 | eight tables created, named as expected, selected by `DATABASE_URL`, visible to the pool |
| Accounts | 4 | create, read by email, identity by (provider, subject), update round-trip |
| Money | 6 | order → entry, entry by public ref, three ledger rows with the 5% split, bigint cents as numbers, settling twice is a no-op |
| Card | 2 | the jsonb card round-trips; a day's armband drops a player who is not on the card |
| Leagues | 3 | create, join by code, both members listed |
| Tokens | 3 | issue, spend once, spend again refused |
| Prizes and corrections | 5 | award stored, marked paid (and the payout ledger row), results override round-trip, webhook id remembered |
| The tables | 2 | every collection reached its table, `users` has real columns and the identity is jsonb |

### 4.9 End to end in a browser — 15/15 (`npm run e2e`)

The full journey is listed in [INSTALL.md](../INSTALL.md#the-end-to-end-test). It runs headless in
about 40 seconds, on a clean store, with a screenshot per step in
[`screenshots/e2e/`](screenshots/e2e). Against Postgres it empties the tables first, so the run never
depends on old data.

### 4.10 Production configuration

| Check | Result |
|---|---|
| `npm run build` | ✅ clean |
| `tsc --noEmit` | ✅ clean |
| `npm run scoring:check` / `payments:check` / `oauth:check` | ✅ 55/55 · 47/47 · 79/79 |
| `npm run db:check` / `db:migrate` (Postgres) | ✅ 27/27 · schema applied |
| `npm run e2e` | ✅ 15/15 (Postgres and the JSON file) |
| All 15 routes render | ✅ 200 |
| Without `ADMIN_TOKEN`, admin endpoints refuse | ✅ 503 |
| Without `STRIPE_WEBHOOK_SECRET`, the webhook refuses | ✅ 503 |
| With a secret, forged and replayed webhooks are refused | ✅ 400 |
| With a secret, a demo order still cannot be settled by Stripe | ✅ 200 `ignored` |
| A pending order cannot save a card | ✅ 402 |

---

## 5. Evidence

### The film

[`demo/twenty-eight-start-to-finish.webm`](../demo/twenty-eight-start-to-finish.webm) — **3:07,
1440×900 VP9, captions burned in, narrated** (eleven clips, Opus mono) — is the whole product in one
sitting: a paid entry, a drafted Captain's Dozen, 28 predictions, Pinpoint guesses, the points
breakdown, a transfer and a day-by-day armband, the public share card, the fantasy leaderboard, a
private league, the actual Ryder Cup leaderboard finishing the cup, and an operator settling that
league's prize pot. Recorded
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

### Screenshots (40)

Four were added for this landing, captured from a second server started **with** dummy provider
credentials (the buttons only exist when `/api/auth/providers` returns something):
**37** `/account` signed out with Google, Apple and Facebook, **38** the same row above the checkout
fields on `/enter`, **39** the callback's refusal banner on `/account?signin=error&reason=…`,
**40** the mobile account page. `verification/screenshots/social-capture-log.json` records the URL and
viewport of each.

The earlier set is unchanged: **34** the transfers page mid-window, **35** the account page's share
and invite block, **36** a public card at `/t/<ref>`.

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
| | | 34 | **Transfers**: window, allowance, swap, armband |
| | | 35 | **Account**: share card, copy/WhatsApp/X, invites |
| | | 36 | **Public card** `/t/<ref>` with points and rank |
| | | 37 | **Social sign-in** on `/account` (Google, Apple, Facebook) |
| | | 38 | **Social sign-in** above the `/enter` checkout |
| | | 39 | A refused link, as the player sees it |
| | | 40 | **Mobile** account page with the provider row |

---

## 6. Reproducing this run

```bash
cd adare-fantasy
npm install
npm run scoring:check && npm run payments:check && npm run oauth:check   # 55 + 47 + 79, no server
npm run db:check                                                       # 27, throwaway Postgres
npm run e2e                                                            # 15, browser, own server
rm -rf .data
npm run build
SESSION_SECRET="$(openssl rand -hex 24)" \
ADMIN_TOKEN="$(openssl rand -hex 24)" \
STRIPE_WEBHOOK_SECRET="$(openssl rand -hex 24)" \
PAYMENTS_PROVIDER=demo npm start

cd verification/harness && npm install
ADMIN_TOKEN=… STRIPE_WEBHOOK_SECRET=… node api.mjs   # 86 contract checks
node checks.mjs                                       # 35 browser assertions
node audit.mjs                                        # axe, 17 routes x 2 viewports
node clock.mjs                                        # 9 checks, needs SCORING_CLOCK=at:600
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
- **Results still come from the seeded simulation.** The feed reader is server-side and tested
  against a fixture, but no provider is connected here, so the "feed" source is exercised only by
  the adapter tests.
- **The scoring clock is a demo convenience.** Unset, results show the finished weekend (so the table
  has 28 matches) while the card clock stays in the pre-lock window (so transfers can be demonstrated).
  A real deployment sets `SCORING_CLOCK=live` for the weekend; `at:<minute>` is the replay path.
- **Mid-window transfers need a clock override to see them.** The demo server's card clock is
  pre-lock, where changes are free by design; start it with `SCORING_CLOCK=at:600` to walk through
  the overnight window and the −4 penalty (`verification/harness/clock.mjs` does exactly that).
- **The public card is a share page, not a feed.** It re-scores on each request; there is no cache or
  CDN invalidation to think about until the real feed lands.
- Accessibility is automated (axe) plus scripted keyboard checks — no screen-reader session.

---

## v0.9 — putting it online (1 November 2026)

Nothing in the product changed for v0.9; what changed is other people being able to see it.

| Strand | What it means | Where |
|---|---|---|
| **A free public path** | `DEPLOY.md`: Vercel Hobby + Neon free Postgres (the recommended pair, ~10 minutes, no card), Render, a GitHub Codespace, or a tunnel from a laptop — with the free-tier catches, the five environment variables and a symptom/cause table. | `DEPLOY.md` |
| **A static gallery for GitHub Pages** | Pages cannot run this app (no Node runtime, so no sessions, no checkout, no database). `docs/` is a one-page gallery instead — eight screenshots plus the leaderboard read from a real JSON export — published by `.github/workflows/pages.yml`. | `docs/index.html`, `.github/workflows/pages.yml` |
| **`npm run snapshot`** | Freezes a running instance (`docs/data/leaderboard.json`, `health.json`), so the static page shows real numbers rather than mock-ups. | `scripts/snapshot.mjs` |
| **`npm run seed`** | Seven demo managers, each a real paid entry settled through the same `createOrder`/`settleOrder` path the app uses, plus a league — so a fresh deployment is not an empty table. `--reset --force` removes only what it created. | `scripts/seed.ts` |
| **`/api/health`** | Reports store, table count, whether the filesystem is ephemeral, payments mode and which social providers are live; the app also warns at boot when a hosted build has no `DATABASE_URL` or `SESSION_SECRET`. Silently losing entries on a serverless host is the failure this exists to prevent. | `app/api/health/route.ts`, `instrumentation.ts` |
| **`npm run docs:check`** | The gallery's build step, since Pages does none: every referenced image must exist, the snapshot JSON must parse, the page must stay under 64KB and `docs/img` under 3MB. Added to CI. | `scripts/check-docs.mjs` |

**Checks re-run after the changes:** `npm run typecheck` clean, `npm run build` clean, `npm run
docs:check` passed (8 screenshots, 1.1MB), `npm run seed` twice against Postgres (second run reports
"already exists" and creates nothing — a first draft did create a second league each run, caught here
and fixed), `npm run seed -- --reset --force` then a fresh seed (7 entries, one league),
`/api/health` → `{ok: true, store: "postgres", storeDetail: "8/8 tables", ephemeral: false}`. The
391 assertions of the v0.8 suite are untouched and unchanged by this release.

**Not verified, and worth saying:** nothing was deployed to Vercel or Neon from this environment —
the steps were written from the app's own requirements and the providers' current free tiers, and
the GitHub Pages workflow has not run on GitHub yet (the first run needs Pages switched to "GitHub
Actions"). The seed script was exercised against both stores (Postgres twice + reset, and a throwaway
JSON file twice + reset); `snapshot` talks only HTTP, so it is store-agnostic.

---

## v0.10 — SQLite, Turso, and other free Postgres (1 November 2026)

The app used to have two backends. It now has three SQL ones and the file store,
picked by the URL alone, with the same rules and the same assertions on each.

| Strand | What it means | Where |
|---|---|---|
| **SQLite** | `LIBSQL_URL=file:.data/twenty-eight.sqlite` — a real database with a real schema in a single file, for a small server or a container with a volume. Nothing to keep running. | `lib/server/store-sqlite.ts`, `db/schema.sqlite.sql` |
| **Turso** | The same schema over HTTPS (`LIBSQL_URL=libsql://…` + `TURSO_AUTH_TOKEN`), so a serverless host no longer needs Postgres to keep its data. Free tier: 5 GB, 100 databases, no card. | `lib/server/store-sqlite.ts` |
| **One shape, three backends** | Column names, select lists and row mapping moved into `lib/server/store-shape.ts`. Postgres writes JSON through `jsonb_to_recordset`; SQLite writes TEXT and 0/1 integers — the normalisation happens in one place, so the payment and prize rules never learn which database is underneath. | `lib/server/store-shape.ts` |
| **One contract** | The 27 store assertions now live in `scripts/store-contract.ts` and are run against Postgres (`npm run db:check`, throwaway cluster) *and* SQLite (`npm run db:check:sqlite`, throwaway file, or a real Turso database via `LIBSQL_URL`). | `scripts/store-contract.ts`, `scripts/db-check{,-sqlite}.ts` |
| **Everywhere else** | `db:migrate` detects the dialect; `install.sh --sqlite` sets up the file instead of a cluster; `start.sh` creates the file if it is missing and reports which store it is using; `e2e` empties and drives SQLite as well; `/api/health` reports `postgres`, `turso`, `sqlite` or `json` and flags a SQLite *file* on a host that throws its filesystem away. | `scripts/{db-migrate,install,start,e2e}.mjs`, `app/api/health/route.ts` |

**Checks after the change:** typecheck clean; build clean; 55/55 scoring, 47/47 payments, 79/79
sign-in; **27/27 Postgres** and **27/27 SQLite** on the shared contract; `db:migrate` twice on both
dialects (idempotent, 9 tables each); seed run against SQLite (7 entries, one league, ~0.9 s);
`start.sh` on a fresh SQLite path creating and migrating the file, `/api/health` →
`{"ok":true,"store":"sqlite","storeDetail":"8/8 tables"}` and the seeded leaderboard served from it;
`install.mjs --sqlite --check` reporting the SQLite store; `docs:check` still green.

**Not verified, and worth saying:** there is no network access to Turso from this environment, so
the `libsql://` path was exercised only as far as connection setup — the SQL and the mapping are the
same code the local file uses, but "works against a real Turso database" is untested here. CI runs
SQLite natively (contract + the full 15-step browser test); the browser test has not been run against
Turso. macOS and Windows were not touched by this change.
