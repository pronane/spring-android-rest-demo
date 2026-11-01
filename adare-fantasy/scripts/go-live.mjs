#!/usr/bin/env node
/**
 * Point the app at a hosted database and leave it ready for visitors.
 *
 *   npm run go-live -- --url=postgresql://user:pass@host/db
 *   npm run go-live -- --url=libsql://my-db-me.turso.io --token=eyJ…
 *   npm run go-live -- --url=postgres://… --no-seed
 *   npm run go-live -- --url=postgres://… --app=https://my-app.vercel.app
 *
 * It applies the right schema, seeds the seven demo entries (so the first
 * visitor does not land on an empty table), checks the result, and prints the
 * environment variables to paste into the host — nothing here needs the app to
 * be deployed yet, and re-running it is harmless.
 *
 * What it cannot do: create the database, or set variables on your host. Those
 * are ten minutes of sign-up, once, in DEPLOY.md.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);

const NO_SEED = has("no-seed");
const CHECK_ONLY = has("check");

const url = flag("url") ?? process.env.LIBSQL_URL ?? process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const token = flag("token") ?? process.env.TURSO_AUTH_TOKEN ?? "";
const app = flag("app") ?? "";

if (!url) {
  console.error(
    "Which database?\n\n" +
      "  npm run go-live -- --url=postgresql://user:pass@host/db\n" +
      "  npm run go-live -- --url=libsql://my-db-me.turso.io --token=…\n\n" +
      "Create it first (Neon, Aiven, Supabase, Turso or your own Postgres), then run this.\n" +
      "DEPLOY.md has the sign-up steps and the free tiers.\n",
  );
  process.exit(2);
}

const scheme = (url.match(/^([a-z0-9+.-]+):/i)?.[1] ?? "").toLowerCase();
const isSqlite = ["libsql", "file", "sqlite"].includes(scheme);
const dialect = isSqlite ? (scheme === "file" ? "SQLite file" : "Turso (libSQL)") : "Postgres";
const where = (() => {
  try {
    return scheme === "file" ? url.replace(/^file:/, "") : new URL(url).host;
  } catch {
    return "the database";
  }
})();

const env = { ...process.env };
if (isSqlite) {
  env.LIBSQL_URL = url;
  delete env.DATABASE_URL;
  if (token) env.TURSO_AUTH_TOKEN = token;
} else {
  env.DATABASE_URL = url;
  delete env.LIBSQL_URL;
  delete env.TURSO_DATABASE_URL;
}

const step = (message) => console.log(`\n·  ${message}`);
const run = (command, commandArgs, extraEnv = {}) =>
  spawnSync(command, commandArgs, { stdio: "inherit", env: { ...env, ...extraEnv }, shell: process.platform === "win32" });

console.log(`Twenty-Eight → ${dialect} at ${where}`);
if (CHECK_ONLY) console.log("(check only: nothing will be written)");

/* ——— 1. schema ——— */
step(CHECK_ONLY ? "Checking the schema…" : "Applying the schema…");
const migrate = run(process.execPath, ["scripts/db-migrate.mjs", `--url=${url}`, ...(CHECK_ONLY ? ["--check"] : [])]);
if (migrate.status !== 0) {
  console.error("\nThe schema could not be applied. Nothing else was touched.");
  process.exit(1);
}

/* ——— 2. demo data ——— */
if (!NO_SEED && !CHECK_ONLY) {
  step("Seeding seven demo entries (skip with --no-seed)…");
  const seed = run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/seed.ts"]);
  if (seed.status !== 0) {
    console.error("\nThe schema is in place but the seed failed — the site will work, just with an empty table.");
  }
}

/* ——— 3. a live deployment, if one was named ——— */
if (app) {
  const base = app.replace(/\/$/, "");
  step(`Asking ${base}/api/health what it thinks it is…`);
  try {
    const response = await fetch(`${base}/api/health`, { headers: { accept: "application/json" } });
    const health = await response.json();
    const ok = health.ok === true;
    console.log(
      `   ${ok ? "ok" : "NOT ok"} — store ${health.store}, ${health.storeDetail}, ephemeral ${health.ephemeral}${health.commit ? `, commit ${health.commit}` : ""}`,
    );
    if (!ok) {
      console.log("   Set DATABASE_URL (or LIBSQL_URL) on the host and redeploy — see DEPLOY.md → If it misbehaves.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(`   could not reach it: ${error.message}`);
    console.log("   (a fresh deployment takes a minute to answer; also check the URL)");
    process.exitCode = 1;
  }
}

/* ——— 4. what to paste into the host ——— */
const block = isSqlite
  ? [`LIBSQL_URL=${url}`, ...(token ? [`TURSO_AUTH_TOKEN=${token.slice(0, 4)}…`] : [])]
  : [`DATABASE_URL=${url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:•••@")}`];

console.log("\n" + "─".repeat(64));
console.log("Paste these into your host (Vercel → Settings → Environment Variables),");
console.log("along with a SESSION_SECRET and an ADMIN_TOKEN from `openssl rand -hex 24`:\n");
for (const line of block) console.log(`   ${line}`);
console.log("\nThen redeploy and check https://<your-app>/api/health — it should say");
console.log(`   "ok": true, "store": "${isSqlite ? (scheme === "file" ? "sqlite" : "turso") : "postgres"}", "ephemeral": false`);
console.log("─".repeat(64) + "\n");
