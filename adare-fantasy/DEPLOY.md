# Putting the demo online, for free

Short answers first.

| Question | Answer |
|---|---|
| **Can this run on GitHub Pages?** | **No.** Pages serves static files only; Twenty-Eight needs a server (accounts, cookies, a paid entry, saved cards, a live table) and a database. A static build would show the pages and break the moment anyone clicked "pay" or "save". What Pages *can* host is the preview gallery in [`docs/`](docs) — screenshots and an explanation, one page, no server. |
| **Is there a free place to run the whole thing, database included?** | **Yes — Vercel + Neon.** Vercel's Hobby plan runs the app and Neon's free tier is a real Postgres. No card for either. Ten minutes, and every feature works. |
| **I just want to show someone today** | Run it locally (`./start.sh`) and open a tunnel: `cloudflared tunnel --url http://localhost:3000`. No account, no deploy, dies when your laptop sleeps. |

The rest of this file is the Vercel + Neon walkthrough, the alternatives, and the things
that will bite you.

---

## The GitHub Pages gallery

`docs/` is a self-contained page: the eight screenshots, what the product does, and the
leaderboard as a real JSON export (`docs/data/leaderboard.json`, written by a running instance).
No build, no dependencies, no server — it can live on Pages forever.

To publish it, once:

1. **Settings → Pages → Source: “GitHub Actions”.** Do this first — the workflow checks for it.
2. **Actions → Twenty-Eight static gallery → Run workflow** (it also runs on any push that touches
   `docs/`).
3. The site appears at `https://<user>.github.io/spring-android-rest-demo/`.

Until step 1 is done the workflow still runs its checks and then skips the deploy, with a note on the
run summary — it will not turn the branch red while Pages is off.

To refresh the numbers after running the app locally:

```bash
./start.sh                       # or BASE=https://your-app.vercel.app npm run snapshot
npm run seed                     # seven demo entries, if the table is empty
npm run snapshot                 # writes docs/data/leaderboard.json
git commit -am "refresh the snapshot" && git push
```

Edit `docs/index.html` to point the two "where to try it" links at your own deployment once you
have one — they currently point at the source and at this file.

---

## Option 1 — Vercel + Neon (recommended, free)

The app is a Next.js app with a Postgres store (`DATABASE_URL`) and it is already written for
serverless: no cron jobs, no long-lived processes, no local files when a database is configured.
`adare-fantasy/` is the app folder inside this repo, which is all Vercel needs to know.

### 1. A database (5 minutes)

1. Sign up at <https://neon.tech> — free, no card.
2. **Create project.** Region: **AWS eu-west-1 (Ireland)** if offered, otherwise the closest EU
   region. The free tier is 0.5 GB and the project auto-suspends after a few idle minutes; the first
   request after that takes about a second to wake it.
3. Copy the **pooled** connection string — the one with `-pooler` in the host:
   `postgresql://user:pass@ep-xxx-pooler.eu-west-1.aws.neon.tech/neondb?sslmode=require`
   (The pooled endpoint matters: serverless functions open and close connections constantly.)

### 2. Create the tables (1 minute, from your machine)

```bash
cd adare-fantasy
DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require" npm run db:migrate
```

You should see eight tables and a `schema_migrations` row. `npm run db:migrate -- --check` confirms it
without changing anything. Re-running is safe — the schema is idempotent.

Optionally fill the table with the demo entries, so the site is not empty when the first visitor
arrives:

```bash
DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require" npm run seed
```

### 3. Deploy (3 minutes)

1. Sign up at <https://vercel.com> with GitHub — Hobby plan, free, no card.
2. **Add New → Project → Import** `pronane/spring-android-rest-demo`.
3. **Root Directory: `adare-fantasy`** ← the one setting people miss.
   Framework preset should read **Next.js**; leave build and install commands alone.
4. **Environment Variables** (Production *and* Preview):

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | the Neon **pooled** string | without it the app falls back to a file, and a serverless file is thrown away — entries vanish |
| `SESSION_SECRET` | `openssl rand -hex 24` | signs the session cookie; the app refuses to sign with the public dev secret in production |
| `ADMIN_TOKEN` | `openssl rand -hex 24` | unlocks `/admin`; without it the admin endpoints fail closed (503) |
| `APP_URL` | `https://<your-project>.vercel.app` | absolute links in emails and Open Graph images. You can set it after the first deploy when you know the URL |
| `PAYMENTS_PROVIDER` | `demo` | no card is charged. Leave Stripe keys unset for a public demo |

5. **Deploy.** First build takes two or three minutes.
6. Open `https://<your-project>.vercel.app/api/health`. You want:

```json
{ "ok": true, "store": "postgres", "storeDetail": "8/8 tables", "ephemeral": false }
```

If it says `"store": "json"` and `"ephemeral": true`, `DATABASE_URL` did not reach the deployment —
fix it in Settings → Environment Variables and redeploy.

### 4. One-click import

<https://vercel.com/new/clone?repository-url=https://github.com/pronane/spring-android-rest-demo&root-directory=adare-fantasy&env=DATABASE_URL,SESSION_SECRET,ADMIN_TOKEN,APP_URL,PAYMENTS_PROVIDER&envDescription=Neon%20pooled%20connection%20string%2C%20two%20random%20secrets%2C%20your%20deployment%20URL%2C%20and%20demo%20payments&project-name=twenty-eight&repository-name=twenty-eight>

It still asks you for the variables — create the database first (step 1), and make sure the root
directory ends up as `adare-fantasy`.

### 5. Let people actually sign in

A visitor can buy an entry, draft a card and call the 28 matches **without signing in** — the payment
creates the account. But coming back on another device needs one of:

- **A mail provider.** [Resend](https://resend.com) free tier is 3,000 emails a month. Set
  `RESEND_API_KEY` and `MAIL_FROM` (a verified sender, or `onboarding@resend.dev`
  to test). Then `/account` → "Email me a link" sends a real 15-minute link.
- **Or a social provider** — Google is the easiest: Google Cloud console → APIs & Services →
  Credentials → OAuth client ID (Web) → authorised redirect URI
  `https://<your-project>.vercel.app/api/auth/google/callback`. Set `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`. The button appears by itself; the flow is documented in
  [README → Signing in](README.md#signing-in).

Without either, the "Email me a link" button will say a link is on its way and nothing will arrive —
`MAIL_OUTBOX` (the local inbox the end-to-end test uses) does not work on a serverless host, because
there is no disk to write to.

---

## Option 2 — Render (also free, a bit slower)

Render's free web service sleeps after 15 minutes of inactivity and takes about a minute to wake. Use
Neon for the database (Render's free Postgres expires after 30 days).

1. <https://render.com> → **New → Blueprint** (or Web Service) → this repo.
2. Root directory `adare-fantasy`, runtime Node, build `npm install && npm run build`,
   start `npm run start`.
3. Environment: the same five variables as above, with `APP_URL` set to the `onrender.com` URL.
4. After the first deploy: `DATABASE_URL=… npm run db:migrate` and `npm run seed` from your machine.

## Option 3 — GitHub Codespaces (nothing to sign up for)

Free for 120 core-hours a month, and the whole thing including Postgres runs inside the container:

```bash
# in a codespace on this repo
cd adare-fantasy
./install.sh          # Node, npm packages, Postgres in .data/pg, schema, build
./start.sh --port 3000
npm run seed
```

Right-click the **Ports** tab → port 3000 → **Port Visibility: Public**, and the forwarded URL is a
shareable link. It stops when the codespace stops, and the database lives on the codespace's disk, so
treat it as a demo, not a deployment.

## Option 4 — a tunnel from your own machine (fastest)

```bash
./start.sh                                    # terminal 1
cloudflared tunnel --url http://localhost:3000 # terminal 2 (brew install cloudflared)
```

`cloudflared` prints a `https://something.trycloudflare.com` URL that anyone can open. No account
needed. Alternatives: `ngrok http 3000`, or `ssh -R 80:localhost:3000 nokey@localhost.run`.

Notes: only do this with `PAYMENTS_PROVIDER=demo`, the tunnel URL changes every run, and `APP_URL`
should be set to it if you want sign-in links to point at the public address.

---

## What stays free, and what does not

| Thing | Free tier | The catch |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth/month, functions included | **non-commercial use only** — fine for a fan demo, not for taking real entry fees. Vercel Pro is the paid step |
| Neon | 0.5 GB storage, one project, autosuspend | first request after idle is ~1s slower; the free branch is fine for thousands of entries |
| Supabase (alternative) | 500 MB Postgres | free projects pause after 7 days without traffic |
| Render free | web service + 750 h | sleeps after 15 min, ~1 min cold start; free Postgres expires in 30 days |
| Resend | 3,000 emails/month | needs a verified sender domain for anything beyond test addresses |
| Codespaces | 120 core-hours/month | it is a development machine, not hosting |

Storage is not the thing you will hit first: the store is a document per deployment, so even a
thousand entries is a few megabytes. The thing you will hit first is Neon's autosuspend on a quiet
demo — that is a one-second delay, not an outage.

---

## Running this as a public demo

It is a demo, and it should say so. Before you hand the link to strangers:

- **Keep `PAYMENTS_PROVIDER=demo` and leave Stripe keys unset.** The checkout page says no card is
  charged; that stays true only if there are no live keys.
- **Set `ADMIN_TOKEN`** to something long and random. `/admin` shows every order, refunds and prize
  settlement; without the token those endpoints return 503.
- **Anyone can create an account and an entry** — that is the point, and it is also the risk. There
  is no rate limiting and no CAPTCHA in this build. If you need those before sharing a link widely,
  that is the next piece of work, not a configuration toggle.
- **The demo data is fake.** `npm run seed` creates seven managers with invented names, seven €10
  orders and a league called "The Adare Invitational". Clear it with
  `npm run seed -- --reset --force`, or leave it — it makes the table look alive.
- **Say what it is.** The footer already says "fan project, not affiliated", and the README has the
  same line. Keep it.

## Updating it later

```bash
git push            # Vercel redeploys on push to the connected branch
```

Schema changes: add a file to `db/migrations/` (e.g. `001-add-something.sql`), then run
`npm run db:migrate` against the production `DATABASE_URL` **before** the new code deploys. The
migration runner applies `db/schema.sql` first and then every `db/migrations/*.sql` in order, recording
checksums in `schema_migrations`.

## Checking on it

- `GET /api/health` — store, table count, whether the filesystem is ephemeral, payments mode, social
  providers, and the commit hash Vercel deployed.
- `GET /api/leaderboard` — the table as JSON; if this is empty and `/api/health` is fine, the database
  is connected but not seeded.
- `/admin` with `ADMIN_TOKEN` — orders, the ledger, prizes and results corrections.

## If it misbehaves

| Symptom | Cause |
|---|---|
| Entries disappear after a while | `DATABASE_URL` missing → the file store on a serverless filesystem. `/api/health` will say `ephemeral: true`. |
| "Could not create the account" on checkout | `SESSION_SECRET` missing → cookie signing throws in production. |
| Sign-in link never arrives | no mail provider (see step 5) — `MAIL_OUTBOX` writes to disk and cannot work on Vercel. |
| Social buttons missing | the provider's credentials are incomplete; `/api/auth/providers` returns only fully configured providers. |
| 503 from `/admin` | `ADMIN_TOKEN` not set, or not sent as `Authorization: Bearer …`. |
| Everything 500s after a deploy | check the build log — most often `pg` missing from `dependencies`, or the root directory set to the repo root instead of `adare-fantasy`. |
