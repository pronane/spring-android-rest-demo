#!/usr/bin/env node
/**
 * Starts everything and keeps it running.
 *
 *   ./start.sh                    macOS / Linux
 *   start.cmd                     Windows
 *   npm run start:local           either OS
 *
 *   --dev            development server with hot reload (default: production build)
 *   --port 4000      a different port
 *   --e2e            run the end-to-end test once the server answers, then exit
 *   --test           same as --e2e, for people who think in tests
 *   --keep           with --e2e, leave the server running afterwards
 *
 * It reads `.env.local` (written by the installer), makes sure the local
 * Postgres cluster is up if that file points at it, builds the app if there is
 * no build yet, waits until it answers, prints the URL, and then behaves like a
 * normal foreground process until you press Ctrl-C.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const DEV = flag("--dev");
const RUN_E2E = flag("--e2e") || flag("--test");
const KEEP = flag("--keep");
const HOST = value("--host", process.env.HOST ?? "0.0.0.0");
const PORT = Number(value("--port", process.env.PORT ?? 3000));

/* ——— configuration ——— */

function loadEnvFile(file = path.join(ROOT, ".env.local")) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const fileEnv = loadEnvFile();
const env = { ...fileEnv, ...process.env };
if (!env.SESSION_SECRET) {
  env.SESSION_SECRET = "local-dev-secret-please-run-the-installer";
  console.warn("\n!  No SESSION_SECRET yet — using a throwaway one. Run the installer to write .env.local.\n");
}

/** True when DATABASE_URL points at the cluster this project manages. */
function usesLocalCluster(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) && parsed.port === String(env.PGPORT ?? 54329);
  } catch {
    return false;
  }
}

async function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(700, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port, host, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/api/session`);
      if (res.ok) return true;
    } catch {
      /* not yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

/* ——— the pieces ——— */

function ensurePostgres() {
  if (!env.DATABASE_URL) {
    console.log("·  Store: the JSON file in .data/ (set DATABASE_URL for Postgres)");
    return true;
  }
  if (!usesLocalCluster(env.DATABASE_URL)) {
    const target = (() => {
      try {
        return new URL(env.DATABASE_URL).host;
      } catch {
        return "DATABASE_URL";
      }
    })();
    console.log(`·  Store: Postgres at ${target} (external — not managed here)`);
    return true;
  }

  const status = spawnSync(process.execPath, ["scripts/local-db.mjs", "status"], { cwd: ROOT, stdio: "pipe", encoding: "utf8" });
  if (status.status === 0) {
    console.log(`·  Store: Postgres at 127.0.0.1:${env.PGPORT ?? 54329} (already running)`);
    return true;
  }
  console.log("·  Starting the local Postgres cluster…");
  const started = spawnSync(process.execPath, ["scripts/local-db.mjs", "start"], { cwd: ROOT, stdio: "inherit" });
  if (started.status !== 0) {
    console.error("!  Postgres did not start. See .data/pg.log.");
    return false;
  }
  console.log(`·  Store: Postgres at 127.0.0.1:${env.PGPORT ?? 54329}`);
  return true;
}

function ensureBuild() {
  if (DEV) return true;
  if (fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) return true;
  console.log("·  No production build yet — building (one minute, once)…");
  const built = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  return built.status === 0;
}

/* ——— main ——— */

console.log("\nTwenty-Eight\n");

if (await portOpen(PORT)) {
  console.error(`!  Something is already listening on port ${PORT}. Try: npm run start:local -- --port 4000`);
  process.exit(1);
}

if (!ensurePostgres()) process.exit(1);
if (!ensureBuild()) process.exit(1);

const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const target = `http://localhost:${PORT}`;
const child = spawn(process.execPath, [nextBin, DEV ? "dev" : "start", "-H", HOST, "-p", String(PORT)], {
  cwd: ROOT,
  // The URL the app prints in emails has to be the one it is actually served on,
  // so a --port run does not mail links to the default port.
  env: { ...env, APP_URL: target },
  stdio: "inherit",
});

let shuttingDown = false;
const shutdown = (signal = "SIGTERM") => {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill(signal);
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(signal));

const ready = await waitForServer(PORT, HOST, DEV ? 120_000 : 60_000);
if (!ready) {
  console.error("\n!  The app did not answer. Is the build broken?");
  shutdown();
  process.exit(1);
}

console.log(`\n${DEV ? "Development server" : "Twenty-Eight"} is up: ${target}`);
console.log(`  Account:  ${target}/account`);
console.log(`  Entry:    ${target}/enter`);
console.log(`  Table:    ${target}/leaderboard`);
console.log("\n  Ctrl-C stops it. Postgres keeps running: npm run db:local -- stop\n");

if (RUN_E2E) {
  console.log("Running the end-to-end test against this server…\n");
  const e2e = spawn(process.execPath, ["scripts/e2e.mjs"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...env, BASE: target, CHROME_PATH: process.env.CHROME_PATH ?? "", CHROME_LIBS: process.env.CHROME_LIBS ?? "" },
  });
  e2e.on("exit", (code) => {
    console.log(code === 0 ? "\nThe end-to-end test passed." : "\nThe end-to-end test failed.");
    if (!KEEP) {
      shutdown();
      process.exit(code ?? 1);
    }
  });
}

child.on("exit", (code) => process.exit(code ?? 0));
