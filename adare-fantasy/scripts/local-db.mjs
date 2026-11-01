#!/usr/bin/env node
/**
 * A Postgres cluster for this project, with no admin rights and nothing
 * installed system-wide.
 *
 *   node scripts/local-db.mjs start     # initdb on first run, then pg_ctl start
 *   node scripts/local-db.mjs status
 *   node scripts/local-db.mjs stop
 *   node scripts/local-db.mjs reset     # stop, delete the cluster, start clean
 *   node scripts/local-db.mjs url       # prints DATABASE_URL
 *
 * The server binaries come from `@embedded-postgres/<platform>-<arch>`, an
 * ordinary npm dependency, so they are already in `node_modules` after
 * `npm install` — on macOS (arm64 and x64), Linux (x64/arm64/arm/ia32/ppc64) and
 * Windows (x64). `pg_ctl` starts the postmaster detached, so the cluster keeps
 * running after this script exits and `npm run dev` can use it.
 *
 * The cluster lives in `.data/pg` (git-ignored, next to the JSON store it
 * replaces) on port 54329, database `twentyeight`. Everything is overridable:
 * PGPORT, PGDATA_DIR, PGUSER_NAME, PGDATABASE.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, process.env.PGDATA_DIR ?? ".data/pg");
const LOG = path.resolve(ROOT, process.env.PGDATA_LOG ?? ".data/pg.log");
const CREDENTIALS = path.resolve(ROOT, process.env.PGCREDENTIALS_FILE ?? ".data/pg-credentials.json");
const PORT = Number(process.env.PGPORT ?? 54329);
const USER = process.env.PGUSER_NAME ?? "twentyeight";
const DATABASE = process.env.PGDATABASE ?? "twentyeight";
const HOST = process.env.PGHOST_NAME ?? "127.0.0.1";

const isWindows = process.platform === "win32";

/* ——— locating the binaries ——— */

function platformPackage() {
  const arch = { x64: "x64", arm64: "arm64", arm: "arm", ia32: "ia32", ppc64: "ppc64" }[os.arch()];
  if (!arch) throw new Error(`There is no bundled Postgres for ${process.platform}/${os.arch()}.`);
  const name = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${arch}`;
  try {
    const entry = require.resolve(name);
    return path.resolve(path.dirname(entry), "..");
  } catch {
    throw new Error(
      `The Postgres binaries for ${process.platform}/${os.arch()} are missing (${name}).\n` +
        `Run "npm install" in ${ROOT} — the package is a normal dependency, no admin rights needed.`,
    );
  }
}

function binaries() {
  const root = platformPackage();
  const bin = path.join(root, "native", "bin");
  const exe = (name) => path.join(bin, isWindows ? `${name}.exe` : name);
  for (const name of ["initdb", "pg_ctl", "postgres"]) {
    if (!fs.existsSync(exe(name))) {
      throw new Error(`Postgres is incomplete: ${exe(name)} not found. Try "npm install" again.`);
    }
  }
  return { initdb: exe("initdb"), pg_ctl: exe("pg_ctl") };
}

/* ——— state ——— */

function credentials() {
  if (fs.existsSync(CREDENTIALS)) return JSON.parse(fs.readFileSync(CREDENTIALS, "utf8"));
  const fresh = { user: USER, password: crypto.randomBytes(18).toString("base64url"), database: DATABASE, port: PORT };
  fs.mkdirSync(path.dirname(CREDENTIALS), { recursive: true });
  fs.writeFileSync(CREDENTIALS, JSON.stringify(fresh, null, 2));
  return fresh;
}

function urlFor(creds = credentials()) {
  return `postgresql://${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.password)}@${HOST}:${creds.port}/${creds.database}`;
}

function initialised() {
  return fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
}

/* ——— the three verbs ——— */

function run(command, args, { quiet = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  return result;
}

function initdb() {
  if (initialised()) return false;
  const { initdb: initdbBin } = binaries();
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  const passwordFile = path.join(os.tmpdir(), `twentyeight-pg-${process.pid}`);
  // initdb reads the superuser password from a file, not a flag.
  fs.writeFileSync(passwordFile, `${credentials().password}\n`);
  try {
    const result = run(initdbBin, [
      `--pgdata=${DATA_DIR}`,
      "--auth=scram-sha-256",
      `--username=${credentials().user}`,
      `--pwfile=${passwordFile}`,
      "--encoding=UTF8",
      "--lc-messages=C",
    ]);
    if (result.status !== 0) throw new Error(`initdb failed (exit ${result.status}).`);
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }
  return true;
}

function pgCtlStatus() {
  const { pg_ctl } = binaries();
  return run(pg_ctl, ["-D", DATA_DIR, "status"], { quiet: true }).status === 0;
}

async function connect(database) {
  const { Client } = require("pg");
  const creds = credentials();
  const client = new Client({ host: HOST, port: creds.port, user: creds.user, password: creds.password, database });
  await client.connect();
  return client;
}

async function ensureDatabase() {
  const client = await connect("postgres");
  try {
    const { rows } = await client.query("select 1 from pg_database where datname = $1", [credentials().database]);
    if (rows.length === 0) {
      // Identifiers cannot be parameterised; the name comes from our own config.
      await client.query(`create database "${credentials().database.replace(/"/g, '""')}"`);
      return true;
    }
    return false;
  } finally {
    await client.end();
  }
}

async function start({ quiet = false } = {}) {
  const created = initdb();
  if (created && !quiet) console.log(`initialised a Postgres cluster in ${path.relative(ROOT, DATA_DIR)}`);

  if (!pgCtlStatus()) {
    const { pg_ctl } = binaries();
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    const options = [`-p ${credentials().port}`, `-c listen_addresses=${HOST}`, "-c password_encryption=scram-sha-256"];
    // Unix sockets live in the data directory by default; the TCP listener is
    // what the app uses, so both work.
    const result = run(pg_ctl, ["-D", DATA_DIR, "-l", LOG, "-o", options.join(" "), "-w", "-t", "60", "start"], {
      quiet,
    });
    if (result.status !== 0) {
      throw new Error(`pg_ctl could not start Postgres. See ${path.relative(ROOT, LOG)}.`);
    }
  }

  const dbCreated = await ensureDatabase();
  if (dbCreated && !quiet) console.log(`created the "${credentials().database}" database`);
  return { started: true, created, dbCreated, url: urlFor() };
}

function stop() {
  if (!initialised() || !pgCtlStatus()) return false;
  const { pg_ctl } = binaries();
  const result = run(pg_ctl, ["-D", DATA_DIR, "-m", "fast", "-w", "-t", "60", "stop"]);
  if (result.status !== 0) throw new Error("pg_ctl could not stop Postgres.");
  return true;
}

/* ——— cli ——— */

const command = process.argv[2] ?? "status";

try {
  if (command === "start") {
    const result = await start();
    console.log(`Postgres is up on ${HOST}:${credentials().port}`);
    console.log(`DATABASE_URL=${result.url}`);
    if (!initialised()) console.log("Run \"npm run db:migrate\" to create the tables.");
  } else if (command === "stop") {
    const stopped = stop();
    console.log(stopped ? "Postgres stopped." : "Postgres was not running.");
  } else if (command === "status") {
    const running = initialised() && pgCtlStatus();
    console.log(
      running
        ? `Postgres is running (${HOST}:${credentials().port}, database ${credentials().database})`
        : "Postgres is not running. Start it with \"npm run db:local -- start\".",
    );
    if (running) console.log(`DATABASE_URL=${urlFor()}`);
    process.exitCode = running ? 0 : 1;
  } else if (command === "url") {
    console.log(urlFor());
  } else if (command === "reset") {
    stop();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    fs.rmSync(CREDENTIALS, { force: true });
    await start();
    console.log("A fresh cluster is up. Run \"npm run db:migrate\" to create the tables.");
  } else {
    console.error(`Unknown command "${command}". Use start | stop | status | url | reset.`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
