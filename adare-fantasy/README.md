# Twenty-Eight — fantasy for the Ryder Cup · v0.2

**Twenty-Eight** is a platform for Ryder Cup fantasy games: one brand, one scoring engine, and a
new *edition* for every cup. The first live edition is **Adare 2027** — the 46th Ryder Cup at Adare
Manor, Co. Limerick (17–19 September 2027), the 100th anniversary of the matches and Ireland's
first staging since the K Club in 2006.

Two ways to play, one paid entry, a 28-match predictor, and a live Sunday you can watch tick over.

| Draft a card | Call all 28 matches | Follow it live |
|---|---|---|
| ![Draft](screenshots/02-draft-classic.png) | ![Predictor](screenshots/05-predict.png) | ![Live](screenshots/06-live-sunday.png) |

> v0.2 is a fan project. Not affiliated with the Ryder Cup, DP World Tour, PGA of America or Adare
> Manor. Checkout is a demo — no card is ever charged and no card data is stored.

---

## What changed in v0.2

| v0.1 | v0.2 |
|---|---|
| Working title "Adare 2027" | **Twenty-Eight** — ownable platform brand, `28` monogram, edition-aware masthead |
| One game (Classic Six) | **Classic Six** *and* **Captain's Dozen** (12 players, 200m, max 6 a side) |
| Free, no entry | **Paid entry** (€10 / €60 league pack / €24 season pass), prize pool + sponsor slots |
| Standings that were "projected" | **Live scoring simulation** across all five sessions, with a wire |
| Draft only | **Match predictor** — all 28 matches, plus MVP / top scorer / rookie |
| Adare only | **Editions** — Adare 2027, Hazeltine 2029, Camiral 2031, plus the Bethpage 2025 and Rome 2023 archive |
| Static demo data | **Free data layer** — Wikipedia, Wikidata and Open-Meteo snapshots refreshed by script |
| Client-only state | **Session auth + server store** for entries, with cookies and HMAC signing |

- Landing: `/` · Draft: `/draft` · Predictor: `/predict` · Live: `/live` · Entry: `/enter`
- Editions: `/editions` · Leagues: `/leagues` · My card: `/team` · Account: `/account`
- Rules & scoring: `/rules` · Player pool: `/players`

Full screenshot set (14 desktop/mobile captures + a GIF of the live simulation) is in
[`screenshots/`](screenshots).

---

## The two games

| | Classic Six | Captain's Dozen |
|---|---|---|
| Squad | 6 players | 12 players |
| Budget | 100m credits | 200m credits |
| Max per side | 4 | 6 |
| Best for | a quick card on the train | the authentic "real captain" shape |

Both require at least one player from each side, one captain (match points ×2), and lock at the
first tee: **Fri 17 Sep 2027, 07:35 IST**. Switching mode clears the card, because budgets and
squad sizes differ — the UI warns before it does.

### Scoring

| Session | Win | Half | Loss |
|---|---|---|---|
| Foursomes (Fri & Sat) | +5 | +2.5 | 0 |
| Fourball (Fri & Sat) | +5 | +2.5 | 0 |
| Singles (Sun) | +6 | +3 | 0 |

Bonuses: appearance +1, birdie +1, eagle +4, albatross +8, hole-in-one +10, unbeaten week (3+
matches) +5. Captain doubles match points only. In Captain's Dozen every player's total is scaled
×0.9 so the two modes sit on comparable leaderboards.

Transfers: 2 free before the lock, then −4 points each. Europe need 14 points to retain the cup,
which is what the live page is counting.

### Match predictor

After the captains name their teams you call **all 28 matches** — 8 foursomes, 8 fourball, 12
singles — plus **MVP, top scorer and rookie of the week**.

| Prediction | Points |
|---|---|
| Correct match winner | +2 |
| Halve correctly called | +2 |
| Exact cup scoreline (bonus) | +10 |
| Correct award | +5 |

Picks lock with your card at the first tee. Pairings before the announcement are the projected
ones, labelled as such.

---

## Entry, prizes and sponsors

Entry is **required to play** — this is not free-to-play with an upsell.

| Plan | Price | What you get |
|---|---|---|
| Single entry | €10 | One card, Classic Six or Captain's Dozen, predictor included |
| League pack | €60 | 8 entries at €7.50 each, commissioner tools, league sponsor slot |
| Season pass | €24 | Adare 2027 + 2029 + 2031, archive editions, priority if the field caps |

A €50,000 pool illustrative at 5,000 entries is split 35 / 15 / 8 / 20 / 7 / 10 / 5 — 1st, 2nd,
3rd, top 10%, best single session, match predictor, and platform/card fees. Private leagues can
add their own buy-in and sponsor pot on top, which is the point of the €60 pack for a group of
mates. Presenting, travel and community sponsor slots are mocked with plausible local partners
(Adare Village Distillery, Shannon Airport, Limerick County Board).

**Checkout is a demo.** `/enter` collects nothing sensitive, posts to `/api/checkout`, and returns a
reference (`TE-xxxx-ADRE`). Card fields are illustrative: they are never sent anywhere and never
stored.

---

## The live simulation

`/live` replays a full cup against a fixed seed. Five sessions, 28 matches, a running cup score, a
player-by-player points table and a wire of every birdie as it lands. Deep links are handy for
demos and for the screenshots:

| Moment | URL |
|---|---|
| Friday foursomes | `/live?t=140` |
| Friday fourball | `/live?t=430` |
| Saturday foursomes | `/live?t=1580` |
| Saturday fourball | `/live?t=1880` |
| Sunday singles, mid-afternoon | `/live?t=3080` |
| Final putt | `/live?t=3300` |

Play / restart / 1× / 2× / 4× controls drive the clock from the same state function, so a demo can
run in 30 seconds.

![Live simulation](screenshots/15-live-simulation.gif)

---

## Data: what's free, what's simulated

Scoring feeds for the Ryder Cup are licensed, so v0.2 uses **only free sources** and simulates the
golf.

| Source | Used for | Licence |
|---|---|---|
| [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) — `2027 Ryder Cup` | edition facts, extract, revision timestamp | CC BY-SA 4.0 |
| [Wikidata](https://www.wikidata.org/wiki/Special:EntityData/Q136488386.json) — `Q136488386` | venue, country, date, sitelink | CC0 |
| [Open-Meteo](https://open-meteo.com/) — Adare (52.5636, −8.7894) | temperature, wind speed/direction, rain probability | CC BY 4.0 |

```bash
npm run data:refresh     # rewrites data/snapshots/adare-2027.json
```

The snapshot is committed so the site works offline and the build is deterministic; the UI shows a
"snapshot · refreshed 31 Oct" chip and the card degrades to "unavailable" past 72 hours. Sources and
attribution are surfaced in the footer and on `/editions`.

**Simulated:** the 24-player field, prices, projections, ownership, form, the pairings, every
match result and every league table. All of it is labelled as projected in the UI.

---

## Stack

| Choice | Why |
|---|---|
| **TypeScript + Next.js 15 (App Router)** | One language for UI, route handlers and the scoring pipeline; server rendering gives real shareable links for "join my league" invites. |
| **Tailwind v4** | Bespoke design system (forest / cream / gold, Fraunces + Inter, self-hosted `.woff2`) with no runtime CSS-in-JS. |
| **React context + `localStorage`** | The card, picks and mode live client-side for speed; the entry and account live server-side. `lib/store.tsx` is the only persistence boundary. |
| **JSON file server store + HMAC cookie session** | `lib/server/db.ts` + `lib/server/auth.ts` back `/api/entry`, `/api/session` and `/api/checkout`. Zero external services, and the interface is narrow enough to swap for Postgres. |

**The Postgres caveat, stated plainly:** entries are written to `.data/twenty-eight.json` and
sessions are stateless HMAC cookies. That is fine for a demo and for a single Node host, but it is
not durable on a serverless platform with an ephemeral filesystem (Vercel), it does not survive
concurrent writes, and it has no audit trail. Before taking real money the store needs to become
Postgres + Prisma with an `entries` / `payments` / `leagues` schema, idempotent payment webhooks,
and the session moved to a signed, rotating cookie with server-side revocation.

Pure helpers (`lib/helpers.ts`), the simulation (`lib/sim.ts`), the edition registry
(`lib/tournaments.ts`) and the providers (`lib/providers.ts`) are framework-free and keep server
components usable — a constraint that came out of the build (`"use client"` modules can't be
imported by server components).

---

## Running it

```bash
cd adare-fantasy
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck
npm run data:refresh
```

No environment variables are required. Dev server picks up `.env.local` if present. The entry store
lives in `.data/twenty-eight.json` (created on first write; delete it to reset).

### Structure

```
adare-fantasy/
├─ app/                  # /, /draft, /predict, /live, /enter, /editions, /leagues,
│                        # /team, /account, /players, /rules + /api/{session,checkout,entry}
├─ components/           # brand, header/footer, tiles, squad board, league table,
│                        # conditions card, countdown
├─ data/snapshots/       # committed free-data snapshots (Wikipedia + Wikidata + Open-Meteo)
├─ lib/
│  ├─ tournaments.ts     # platform brand, editions, modes, plans, prize split, sponsors
│  ├─ helpers.ts         # budget, validation, projections, auto-pick
│  ├─ sim.ts             # seeded match engine, sessions, live state, scoring
│  ├─ providers.ts       # snapshot reader (staleness, compass, conditions summary)
│  ├─ store.tsx          # card state + localStorage (key `twentyeight:v2`)
│  └─ server/            # JSON store + cookie session
├─ scripts/refresh-data.mjs
├─ public/               # hero art, self-hosted fonts
└─ screenshots/          # the captures in this doc
```

The demo card ("Bogey Merchants", six players, two leagues, `TE-8F42-ADRE`) is pre-loaded so every
screen has content on first visit. "Start fresh" clears it.

---

## Roadmap to v1

1. **Real field and prices** — nightly ingest of the European points list, US qualifying standings
   and OWGR; "field confirmed" flow with automatic refunds for missing players.
2. **Postgres + Prisma** — move entries, payments, leagues and audit trail off the JSON file; signed
   payment webhooks; a correction console for scoring.
3. **Real scoring** — a licensed feed, or a volunteer scorer console with two-person verification,
   hole-by-hole idempotent updates pushed over websockets.
4. **Payments for real** — Stripe/Stripe Tax, T&Cs, 18+, geo-gating, responsible-play copy, and a
   published prize-pool guarantee.
5. **Game depth** — transfer market at the lock, per-session captaincy, head-to-head private
   leagues, champion's bonus for the winning side.
6. **Growth** — PWA install, OG cards for team shares, WhatsApp invite previews, Irish-language
   toggle, accessibility pass.
7. **Editions as a product** — Hazeltine 2029 and Camiral 2031 already render from the registry;
   the next step is per-edition art, pricing and prize pools rather than a code change.

---

## Screenshot method

Headless Chromium via Puppeteer at 1440×1000–1300 (desktop, 1.5× DPR) and 390×844 (mobile, 2× DPR),
`networkidle0` plus `document.fonts.ready`, with the card pre-seeded into `localStorage` so states
are reproducible. The GIF is 12 frames of `/live` at 4× from `?t=2740` to the final putt.
