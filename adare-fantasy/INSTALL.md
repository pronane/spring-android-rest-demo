# Running Twenty-Eight on your own machine

One command installs everything the app needs — including a real Postgres, if you
want one — and one command starts it and drives a browser through the whole
product to prove it works.

| | Install | Start | Start + test |
|---|---|---|---|
| **macOS / Linux** | `./install.sh` | `./start.sh` | `./start.sh --e2e` |
| **Windows** | `.\install.ps1` | `start.cmd` | `start.cmd --e2e` |
| **Any (npm)** | `npm run install:local` | `npm run start:local` | `npm run start:local -- --e2e` |

You do not need Node, Postgres, Docker or administrator rights. If the machine
has them, the installer uses them; if it does not, it puts private copies under
your home directory and leaves the rest of the system alone.

> **Windows note:** PowerShell may refuse to run an unsigned script. Run it once
> per session with `Set-ExecutionPolicy -Scope Process Bypass` first, or call it
> as `powershell -ExecutionPolicy Bypass -File .\install.ps1`.

---

## What the installer does

Each step checks before it acts, so running it twice is harmless, and nothing is
downloaded that is already there.

| Step | What it checks | What it does if it is missing |
|---|---|---|
| **1. Node.js 20+** | `node -v` | `install.sh` / `install.ps1` download the current release from nodejs.org, **verify its published SHA-256**, and unpack it into `~/.twenty-eight/node` (macOS/Linux) or `%LOCALAPPDATA%\TwentyEight\node` (Windows). No `sudo`, no PATH changes, no system install. |
| **2. Dependencies** | `node_modules/next` | `npm install` (about a minute). This is also what brings the Postgres binaries — they are ordinary npm packages, so no database installer and no admin. |
| **3. Database** | `.data/pg` exists and `pg_ctl status` | `initdb` a cluster in `.data/pg`, start it on **port 54329**, create the `twentyeight` database, apply [`db/schema.sql`](db/schema.sql) — eight tables plus a migrations table. `--sqlite` applies [`db/schema.sqlite.sql`](db/schema.sqlite.sql) to one file instead; `--no-postgres` keeps the JSON store. |
| **4. Configuration** | `.env.local` | Adds only the keys that are missing: `SESSION_SECRET`, `ADMIN_TOKEN`, `APP_URL`, `PAYMENTS_PROVIDER=demo`, `MAIL_OUTBOX=.data/outbox`, and `DATABASE_URL` or `LIBSQL_URL` for the store you chose. Your edits are never overwritten. |
| **5. Browser** | Chrome / Edge / Chromium / Brave, or one puppeteer already cached | Downloads Chrome for Testing into `~/.cache/puppeteer` (skipped if any browser is present; tests are skipped, not failed, if none can be found). |
| **6. Build and smoke test** | `.next/BUILD_ID` | `next build`, then starts the app for a few seconds and checks that `/`, `/enter`, `/leaderboard`, `/api/auth/providers` and `/api/session` answer. |

`./install.sh --check` reports all of the above without changing anything:

```
Twenty-Eight — local installer
  linux/x64 · Node 22.22.3 · /path/to/adare-fantasy

✓ Node.js  v22.22.3 on linux/x64
✓ Dependencies  installed
✓ Postgres  local cluster running
✓ Configuration  .env.local has a session secret
✓ Browser for the end-to-end test  google-chrome
✓ Build  present
```

### What it does not do

- No `sudo`, no UAC prompt, no system packages, no login-shell changes.
- No accounts, keys or data sent anywhere. The only outbound requests are to
  nodejs.org (Node), registry.npmjs.org (packages) and, only if you have no
  browser, Google's Chrome-for-Testing bucket.
- It does not touch any Postgres you already run. The cluster it creates lives
  inside the project and listens on 127.0.0.1:54329 only.

---

## Where everything goes

| Path | What it is | Safe to delete? |
|---|---|---|
| `.data/pg/` | the Postgres cluster (initdb output, WAL, logs in `.data/pg.log`) | yes — `npm run db:local -- reset` rebuilds it |
| `.data/twenty-eight.json` | the store when Postgres is off | yes, it is the whole database |
| `.data/outbox/` | every email the app "sent", as JSON — including sign-in links | yes |
| `.data/install-state.json` | what the installer did, and when | yes |
| `.env.local` | secrets and configuration | yes — re-run the installer |
| `.next/` | the production build | yes |
| `~/.twenty-eight/node` | the private Node, if one was downloaded | yes |
| `db/schema.sql` | the tables — the single source of truth for the database | **no** |

---

## Where the data goes: Postgres, SQLite, Turso, or a file

The app talks to whatever `DATABASE_URL` (Postgres) or `LIBSQL_URL` (SQLite, or
Turso over libSQL) points at, and to a JSON file when neither is set. Every SQL
backend passes the same 27-assertion store contract (`db:check`, `db:check:sqlite`)
and the same 15-step browser test, so the choice is about hosting, not features.
[DEPLOY.md](DEPLOY.md#where-the-data-can-live) has the comparison table.

```bash
./install.sh --sqlite          # one file: .data/twenty-eight.sqlite, no cluster
./install.sh --no-postgres     # the JSON file, no database at all
./install.sh                   # the default: a private Postgres cluster
```

Or by hand, for SQLite:

```bash
npm run db:migrate -- --url=file:.data/twenty-eight.sqlite
LIBSQL_URL=file:.data/twenty-eight.sqlite npm run start:local
```

For Turso, set `LIBSQL_URL=libsql://…` and `TURSO_AUTH_TOKEN=…` and run
`npm run db:migrate` — the schema is the same `db/schema.sqlite.sql`.

```bash
npm run db:local -- start     # start the cluster in .data/pg (initdb on first run)
npm run db:local -- status    # is it up? prints DATABASE_URL
npm run db:migrate            # apply db/schema.sql (idempotent)
npm run db:migrate -- --check # report, change nothing
npm run db:migrate -- --url=file:.data/twenty-eight.sqlite   # the SQLite schema
npm run db:local -- reset     # stop, wipe .data/pg, start clean (then db:migrate)
npm run db:check              # 27 assertions against a throwaway Postgres cluster
npm run db:check:sqlite       # the same 27 against a throwaway SQLite file
```

### Using your own Postgres

Point the app at it and create the tables:

```bash
export DATABASE_URL=postgresql://you:secret@localhost:5432/twentyeight
npm run db:migrate
npm run start:local
```

`db/schema.sql` is plain SQL — `psql -f db/schema.sql` does the same thing. Any
additional migrations dropped into `db/migrations/*.sql` are applied in order by
`db:migrate`, each recorded in `schema_migrations` with its checksum.

To keep the file store instead, install with `--no-postgres` (or remove
`DATABASE_URL` from `.env.local`) — nothing else changes. `--sqlite` is the
middle ground: a real database with a schema, in a single file, and nothing to
keep running.

---

## Starting it

```bash
./start.sh                # production build on http://localhost:3000
./start.sh --dev          # development server with hot reload
./start.sh --port 4000    # somewhere else
./start.sh --e2e          # start, run the end-to-end test, stop
```

`start.sh` reads `.env.local`, starts the local Postgres if that is where
`DATABASE_URL` points, builds the app if there is no build yet, waits until it
answers, prints the URLs, and then behaves like any foreground process until you
press Ctrl-C. Postgres is deliberately left running — `npm run db:local -- stop`
stops it.

---

## The end-to-end test

`npm run e2e` starts a server on a clean store, opens a real browser, and plays a
new player all the way through. It is the same journey in the installer's
`--e2e`, in CI, and on your machine:

| # | Step | What is asserted |
|---|---|---|
| 01 | The site is up | the home page renders the brand and the edition |
| 02 | Opening the entry page | the checkout form is there |
| 03 | Filling in details | email, manager and team name take |
| 04 | Checkout | an order is created and the payment page opens at €10 |
| 05 | Paying | the order settles and a `TE-…-ADRE` entry exists |
| 06 | **Drafting by hand** | six players are clicked in, a captain is named, the card saves |
| 07 | **Calling the matches** | all 28 picks across the five sessions, plus the three awards, saved |
| 08 | Their card | the team page shows the six they picked |
| 09 | The account page | the entry, the email and the points breakdown |
| 10 | The fantasy table | their entry is in it |
| 11 | The public card | `/t/<ref>` shows the team, points and rank |
| 12 | Transfers | a swap goes through, is recorded in the history and costs nothing pre-lock |
| 13 | Social sign-in | the buttons on `/account` match exactly what `/api/auth/providers` offers (none by default) |
| 14 | Signing back in | sign out, request a one-time link, the email arrives in the outbox, following it lands on the same entry |
| 15 | The console | no JavaScript errors anywhere in the run |

```bash
npm run e2e                  # headless, ~40 s, starts its own server
npm run e2e -- --headed      # watch it click
npm run e2e -- --shots       # also write a screenshot per step to .data/e2e-shots/
BASE=http://localhost:3000 npm run e2e    # against a server you already have running
```

Exit code 0 means every step passed; a failure names the step, prints the reason
and leaves `.data/e2e-shots/failure.png` of the screen it was on. On a Postgres
setup the run first empties the tables, so it never depends on old data.

`npm run e2e` writes its *emails* to `MAIL_OUTBOX` (`.data/outbox` by default)
instead of sending them, which is how step 14 reads the sign-in link. That is
also handy by hand: run the app, ask for a sign-in link, and open the JSON file.

---

## Uninstalling

```bash
npm run db:local -- stop
rm -rf .data .env.local .next node_modules       # Windows: Remove-Item -Recurse -Force
rm -rf ~/.twenty-eight                            # the private Node, if one was downloaded
```

Nothing outside those directories was touched.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Something is already listening on port 3000` | `./start.sh --port 4000`, or stop whatever owns 3000. |
| `Postgres could not start` | Read `.data/pg.log`. Usually a port clash: `PGPORT=54330 npm run db:local -- start` (and the same `PGPORT` when starting the app). |
| `The schema could not be applied` | `npm run db:migrate` on its own prints the SQL error. With your own server, check the user can create tables. |
| `No browser found for the end-to-end test` | Install Chrome or Edge, run `npx @puppeteer/browsers install chrome@stable`, or set `CHROME_PATH=/path/to/chrome`. |
| The e2e run hangs on a step | Re-run with `--headed` and watch; `SHOTS=1` gives you a picture per step. |
| Windows: "running scripts is disabled" | `powershell -ExecutionPolicy Bypass -File .\install.ps1` |
| Corporate proxy / offline machine | Install Node 20+ and Chrome yourself, then `npm run install:local -- --no-postgres --skip-deps` and `npm run start:local`; the app needs no outside network at runtime. |
| I already have Postgres 14/15/16/17/18 | Fine — `DATABASE_URL=…` and `npm run db:migrate`. The bundled binaries are only used when you do not. |

---

## What has actually been run

This matters more than what the scripts claim, so:

| | Status |
|---|---|
| **Linux x64** (Ubuntu 22.04, Node 22) | `install.sh` from a clean `.data`/`.env.local`/`.next`: Node check, dependencies, `initdb`, `createdb`, schema (9 tables), `.env.local`, build, smoke test — then `./start.sh --e2e`: **15/15 steps**, against Postgres and against the JSON file. `npm run db:check`: **27/27**. |
| **macOS** | The shell installer and the bundled Postgres binaries support arm64 and x64; the same scripts and the same code paths as Linux. Not exercised on a Mac in this environment. |
| **Windows** | `install.ps1`, `start.cmd` and the npm scripts are written for PowerShell 5.1+ and use the `@embedded-postgres/windows-x64` binaries; the browser detection looks for Chrome and Edge. **Not run on a Windows machine in this environment** — if it fails, the step it fails on is in `install.mjs` and every step is idempotent, so re-running with `-Check` shows where it stopped. |
