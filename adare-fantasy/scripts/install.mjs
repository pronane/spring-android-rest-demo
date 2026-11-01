#!/usr/bin/env node
/**
 * One-shot local installer for Twenty-Eight.
 *
 *   ./install.sh                 macOS / Linux   (bootstraps Node if it is missing)
 *   .\install.ps1                Windows         (same, in PowerShell)
 *   npm run install:local -- --check          report only, change nothing
 *   npm run install:local -- --no-postgres    keep the file store instead
 *
 * What it does, in order — each step checks before it acts, so running it twice
 * is harmless:
 *
 *   1. Node 20+ (the shell wrappers download a portable copy if the machine has
 *      none; this script fails with instructions rather than guessing).
 *   2. Dependencies (`npm install`) — including Postgres's binaries, which are
 *      ordinary npm packages, so nothing needs admin rights.
 *   3. Postgres: initialise a cluster in `.data/pg`, start it, create the
 *      database, apply `db/schema.sql`. Skip with `--no-postgres`.
 *   4. `.env.local`: a session secret, an admin token, the database URL and a
 *      local mail outbox — only the keys that are missing, so your edits survive.
 *   5. A browser for the end-to-end test, if the machine has none.
 *   6. `next build`, and a smoke test of the built app.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findBrowser } from "./browser.mjs";

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const has = (flag) => args.has(flag);
const CHECK_ONLY = has("--check");
const WANT_POSTGRES = !has("--no-postgres");
const SKIP_DEPS = has("--skip-deps");
const SKIP_BUILD = has("--no-build");
const PORT = Number(process.env.PORT ?? 3000);
const ENV_FILE = path.join(ROOT, ".env.local");
const STATE_FILE = path.join(ROOT, ".data", "install-state.json");
const IS_WINDOWS = process.platform === "win32";

const green = (text) => (process.stdout.isTTY ? `\u001b[32m${text}\u001b[0m` : text);
const red = (text) => (process.stdout.isTTY ? `\u001b[31m${text}\u001b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\u001b[2m${text}\u001b[0m` : text);

let problems = 0;
const done = [];
const notes = [];

function ok(name, detail = "") {
  console.log(`${green("✓")} ${name}${detail ? dim(`  ${detail}`) : ""}`);
}
function todo(name, detail = "") {
  console.log(`• ${name}${detail ? dim(`  ${detail}`) : ""}`);
}
function fail(name, detail = "") {
  problems += 1;
  console.log(`${red("✗")} ${name}${detail ? `\n  ${detail}` : ""}`);
}

const run = (command, commandArgs, options = {}) =>
  spawnSync(command, commandArgs, { cwd: ROOT, stdio: "inherit", shell: IS_WINDOWS, ...options });

const runQuiet = (command, commandArgs) =>
  spawnSync(command, commandArgs, { cwd: ROOT, encoding: "utf8", shell: IS_WINDOWS });

/* ——— .env.local ——— */

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Adds the keys that are missing; leaves anything already there alone. */
function writeEnv(additions, { force = false } = {}) {
  const existing = readEnvFile();
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  const added = [];
  for (const [key, value] of Object.entries(additions)) {
    if (existing[key] && !force) continue;
    if (existing[key] && force) {
      const index = lines.findIndex((line) => line.startsWith(`${key}=`));
      if (index >= 0) lines.splice(index, 1);
    }
    lines.push(`${key}=${value}`);
    added.push(key);
  }
  // Keep a short header so a reader knows where these came from.
  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const header = fs.existsSync(ENV_FILE) ? "" : "# Written by scripts/install.mjs — edit freely; the installer only adds missing keys.\n";
  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
  fs.writeFileSync(ENV_FILE, `${header}${body}\n`, "utf8");
  return added;
}

/* ——— the steps ——— */

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) {
    ok("Node.js", `v${process.versions.node} on ${process.platform}/${process.arch}`);
    return;
  }
  fail(
    "Node.js 20+ is required",
    `This is v${process.versions.node}. Install a current LTS from https://nodejs.org, or run ./install.sh (macOS/Linux) / .\\install.ps1 (Windows), which fetch a private copy for you.`,
  );
}

function dependencies() {
  const installed = fs.existsSync(path.join(ROOT, "node_modules", "next", "package.json"));
  if (installed && SKIP_DEPS) {
    ok("Dependencies", "already installed");
    return true;
  }
  if (CHECK_ONLY) {
    installed ? ok("Dependencies", "installed") : todo("Dependencies", "npm install has not run");
    return installed;
  }
  todo("Dependencies", installed ? "updating npm packages" : "installing — this takes a couple of minutes");
  const result = run("npm", ["install", "--no-audit", "--no-fund"]);
  if (result.status !== 0) {
    fail("npm install failed", "Re-run it by hand to see the full output: npm install");
    return false;
  }
  ok("Dependencies", "installed");
  return true;
}

function localPostgres() {
  const credentials = path.join(ROOT, ".data", "pg-credentials.json");
  if (CHECK_ONLY) {
    const running = fs.existsSync(credentials) && spawnSync(process.execPath, ["scripts/local-db.mjs", "status"], { cwd: ROOT }).status === 0;
    running ? ok("Postgres", "local cluster running") : todo("Postgres", "not running (npm run db:local -- start)");
    return { url: readEnvFile().DATABASE_URL ?? null, started: false };
  }

  todo("Postgres", "starting a private cluster in .data/pg — no admin rights needed");
  const start = run(process.execPath, ["scripts/local-db.mjs", "start"]);
  if (start.status !== 0) {
    fail("Postgres could not start", "See .data/pg.log. The app still runs on the JSON file store (--no-postgres).");
    return { url: null, started: false };
  }
  const url = runQuiet(process.execPath, ["scripts/local-db.mjs", "url"]).stdout?.trim() ?? "";
  const migrate = run(process.execPath, ["scripts/db-migrate.mjs", `--url=${url}`]);
  if (migrate.status !== 0) {
    fail("The schema could not be applied", "Run: npm run db:migrate");
    return { url: null, started: true };
  }
  ok("Postgres", "cluster up, schema applied from db/schema.sql");
  return { url, started: true };
}

function environment({ databaseUrl }) {
  const additions = {
    SESSION_SECRET: crypto.randomBytes(24).toString("hex"),
    ADMIN_TOKEN: crypto.randomBytes(18).toString("hex"),
    APP_URL: `http://localhost:${PORT}`,
    PAYMENTS_PROVIDER: "demo",
    // Every email the app sends lands here as a JSON file — handy for the
    // sign-in link without configuring a mail provider.
    MAIL_OUTBOX: ".data/outbox",
  };
  if (databaseUrl) additions.DATABASE_URL = databaseUrl;

  if (CHECK_ONLY) {
    const present = readEnvFile();
    present.SESSION_SECRET ? ok("Configuration", ".env.local has a session secret") : todo("Configuration", ".env.local is missing SESSION_SECRET");
    return present;
  }
  const added = writeEnv(additions, { force: false });
  ok("Configuration", added.length > 0 ? `.env.local: added ${added.join(", ")}` : ".env.local already complete");
  return readEnvFile();
}

async function browserStep() {
  const found = await findBrowser();
  if (found) {
    ok("Browser for the end-to-end test", path.basename(found.executablePath));
    return true;
  }
  if (CHECK_ONLY) {
    todo("Browser", "none found — the e2e test needs Chrome or Edge");
    return false;
  }
  todo("Browser", "none found — fetching Chrome for the test (about 150 MB, into ~/.cache/puppeteer)");
  const result = run("npx", ["--yes", "@puppeteer/browsers@latest", "install", "chrome@stable"]);
  if (result.status !== 0) {
    fail(
      "Chrome could not be downloaded",
      "Install Chrome or Edge yourself, then run: npm run e2e\n(tests are skipped if no browser is present)",
    );
    return false;
  }
  ok("Browser for the end-to-end test", "downloaded");
  return true;
}

function build() {
  if (SKIP_BUILD) {
    ok("Build", "skipped (--no-build)");
    return true;
  }
  if (CHECK_ONLY) {
    fs.existsSync(path.join(ROOT, ".next", "BUILD_ID")) ? ok("Build", "present") : todo("Build", "not built yet (npm run build)");
    return true;
  }
  todo("Build", "next build");
  const result = run("npm", ["run", "build"]);
  if (result.status !== 0) {
    fail("The build failed", "Fix the error above, then re-run this installer.");
    return false;
  }
  ok("Build", "production bundle written to .next/");
  return true;
}

async function smokeTest(env) {
  if (CHECK_ONLY || !fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) return true;
  todo("Smoke test", "starting the app for a moment");
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, ...env, NODE_ENV: "production", APP_URL: `http://127.0.0.1:${PORT}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  const routes = ["/", "/enter", "/leaderboard", "/api/auth/providers", "/api/session"];
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try {
      ready = (await fetch(`http://127.0.0.1:${PORT}/api/session`)).ok;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  let failed = !ready;
  if (ready) {
    for (const route of routes) {
      const res = await fetch(`http://127.0.0.1:${PORT}${route}`).catch(() => null);
      if (!res || !res.ok) {
        fail(`Smoke test: ${route}`, res ? `HTTP ${res.status}` : "no response");
        failed = true;
      }
    }
  } else {
    fail("Smoke test: the app did not answer", output.join("").slice(-800));
    failed = true;
  }
  child.kill("SIGTERM");
  if (!failed) ok("Smoke test", `${routes.length} routes answered`);
  return !failed;
}

/* ——— main ——— */

console.log(`\nTwenty-Eight — local installer`);
console.log(dim(`  ${process.platform}/${process.arch} · Node ${process.versions.node} · ${ROOT}\n`));

if (!fs.existsSync(path.join(ROOT, "package.json"))) {
  fail("This is not the app directory", "Run the installer from the adare-fantasy folder (where package.json lives).");
  process.exit(1);
}

checkNode();
if (problems > 0) process.exit(1);

const depsReady = dependencies();
if (!depsReady && !CHECK_ONLY) process.exit(1);

let databaseUrl = null;
if (WANT_POSTGRES) {
  const postgres = localPostgres();
  databaseUrl = postgres.url;
  if (databaseUrl) done.push("Postgres cluster in .data/pg with the schema applied");
} else {
  notes.push("Postgres skipped (--no-postgres): the app stores everything in .data/twenty-eight.json.");
}

const env = environment({ databaseUrl });
const browserReady = await browserStep();
const built = build();
if (built) await smokeTest(env);

if (!CHECK_ONLY) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        installedAt: new Date().toISOString(),
        node: process.versions.node,
        platform: `${process.platform}/${process.arch}`,
        database: databaseUrl ? "postgres (.data/pg)" : "json (.data/twenty-eight.json)",
        browser: browserReady,
        built: fs.existsSync(path.join(ROOT, ".next", "BUILD_ID")),
      },
      null,
      2,
    ),
  );
}

const store = databaseUrl ? "Postgres (db/schema.sql)" : "the JSON file in .data/";
console.log(`\n${problems === 0 ? green("Ready.") : red("Finished with problems.")}  Store: ${store}\n`);
console.log(`  Start it:        ${IS_WINDOWS ? "start.cmd" : "./start.sh"}          ${dim("(or: npm run start:local)")}`);
console.log(`  Watch the test:  npm run e2e -- --headed`);
console.log(`  Run the test:    npm run e2e              ${dim("(15 steps, about 40 s)")}`);
console.log(`  Stop Postgres:   npm run db:local -- stop`);
console.log(`  Logs and state:  .data/  ${dim("(git-ignored)")}`);
if (notes.length > 0) {
  console.log("");
  for (const note of notes) console.log(dim(`  ${note}`));
}
console.log("");
process.exitCode = problems === 0 ? 0 : 1;
