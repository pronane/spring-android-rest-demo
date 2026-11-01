# Three ways to get a URL

Pick the row that matches how long you want the link to live. All three run the
whole product — accounts, paid entry, draft, the 28-match predictor, leagues, the
live table.

| | Time | Account needed | The link |
|---|---|---|---|
| **A. A Codespace** | ~4 min, one click | GitHub (you have it) | `https://<codespace>-3000.app.github.dev` — public, stays up while the codespace runs |
| **B. Vercel + a free database** | ~10 min | Vercel + Neon (both "sign in with GitHub", no card) | `https://<project>.vercel.app` — a real deployment you can put on a business card |
| **C. GitHub Pages gallery** | ~1 min | GitHub | `https://<user>.github.io/spring-android-rest-demo/` — screenshots and a frozen table, **not** the app |

Deployments A and B need no database service if you use the SQLite/Turso path
(see [Where the data can live](DEPLOY.md#where-the-data-can-live)); B with Turso
is the shortest route to a permanent URL.

---

## A. A Codespace — the fastest real URL

1. Open **<https://codespaces.new/pronane/spring-android-rest-demo?quickstart=1>**
   (or: the repo → **Code ▾ → Codespaces → Create codespace on master**).
2. Wait for *"Twenty-Eight starting — port 3000"* in the terminal. The
   `.devcontainer` has already installed, migrated the SQLite database, seeded
   seven demo entries and built the app — about four minutes on a 2-core box.
3. The **Ports** tab → port **3000** → the globe icon opens the public URL, or
   open the forwarded address directly. It looks like
   `https://<name>-3000.app.github.dev`.
4. Send that URL to anyone. It stays public while the codespace is running; a
   codespace stops itself after 30 idle minutes (the data is on its disk, so it
   comes back).

Change `SESSION_SECRET`/`ADMIN_TOKEN` in `.devcontainer/devcontainer.json` if you
keep one running for a while; the defaults are published here.

## B. Vercel + Turso or Postgres — a permanent URL

1. **Create the database** (5 min):
   - *Turso* (free, 5 GB): `turso db create twenty-eight --location lhr`, then
     `turso db show twenty-eight --url` and `turso db tokens create twenty-eight`.
   - *or Neon* (free, 0.5 GB): create a project, copy the **pooled** connection string.
2. **Prepare it from your machine** — schema, seven demo entries, and the
   environment block to paste into Vercel:

   ```bash
   cd adare-fantasy
   npm run go-live -- --url=libsql://twenty-eight-….turso.io --token=eyJ…
   # or:  npm run go-live -- --url=postgresql://…-pooler…/neondb?sslmode=require
   ```

   It prints `LIBSQL_URL` (or `DATABASE_URL`) plus what to add beside it:
   `SESSION_SECRET`, `ADMIN_TOKEN`, `APP_URL`, `PAYMENTS_PROVIDER=demo`.
3. **Deploy** (3 min): <https://vercel.com/new/clone?repository-url=https://github.com/pronane/spring-android-rest-demo&root-directory=adare-fantasy>
   → **Root Directory `adare-fantasy`** → paste the variables → **Deploy**.
4. **Check** `https://<project>.vercel.app/api/health`:

   ```json
   { "ok": true, "store": "turso", "storeDetail": "8/8 tables", "ephemeral": false }
   ```

   or run `npm run go-live -- --url=… --app=https://<project>.vercel.app --check`,
   which does the same check and says what is wrong if it is not `ok`.

5. **Sign-in for visitors**: checkout creates the account, but coming back on
   another device needs email or Google — set `RESEND_API_KEY` (free, 3k/month) or
   a Google OAuth client. Without one they can play, but not return.
   [DEPLOY.md step 5](DEPLOY.md#5-let-people-actually-sign-in).

Full detail, alternatives (Render, Fly, a VPS with SQLite) and the free-tier
catches: **[DEPLOY.md](DEPLOY.md)**.

## C. The GitHub Pages gallery

Once: **Settings → Pages → Source: "GitHub Actions"**, then **Actions →
Twenty-Eight static gallery → Run workflow**. Or just push anything under
`adare-fantasy/docs/`. Refresh the numbers with `npm run snapshot`.

The gallery is screenshots and a JSON export of the real table — Pages cannot run
the app itself (no Node, no sessions, no database). See
[DEPLOY.md](DEPLOY.md#the-github-pages-gallery).

---

## What I cannot do for you

Everything above needs an account I do not have: the Codespace, the Vercel
project and the database are yours. Nothing in the repository requires a card, a
domain, or a paid plan to go live — but the clicks are yours to make.
