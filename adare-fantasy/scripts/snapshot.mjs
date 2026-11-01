#!/usr/bin/env node
/**
 * Freeze a running instance into static JSON, for GitHub Pages.
 *
 *   node scripts/snapshot.mjs                       # http://127.0.0.1:3000
 *   BASE=https://twenty-eight.vercel.app node scripts/snapshot.mjs
 *
 * Writes `docs/data/*.json`, which the static gallery in `docs/` reads. The app
 * itself cannot run on Pages — no Node, no cookies, no database — so this is the
 * honest version of "put the demo on GitHub": the shapes and the numbers, live,
 * with no server to keep alive. Re-run it whenever you want the page to update.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs", "data");
const BASE = (process.env.BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");

async function get(pathname) {
  const response = await fetch(`${BASE}${pathname}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${pathname} → ${response.status} ${response.statusText}`);
  return response.json();
}

/**
 * The leaderboard carries more than the gallery needs (entry ids, per-entry
 * flags), and the ids are meaningless to a visitor. Keep the shape, drop the noise.
 */
function boardRows(payload) {
  return (payload.rows ?? []).map((row) => ({
    rank: row.rank,
    team: row.team,
    manager: row.manager,
    card: row.card,
    predictions: row.predictions,
    penalty: row.penalty,
    total: row.total,
  }));
}

try {
  const [health, leaderboard] = await Promise.all([get("/api/health"), get("/api/leaderboard")]);

  fs.mkdirSync(OUT, { recursive: true });

  const snapshot = {
    capturedAt: new Date().toISOString(),
    source: BASE,
    edition: { name: "Adare 2027", course: "Adare Manor", dates: ["2027-09-17", "2027-09-19"] },
    cup: leaderboard.results?.cup ?? null,
    results: {
      source: leaderboard.results?.source ?? null,
      finals: leaderboard.results?.finals ?? null,
      total: leaderboard.results?.total ?? null,
      phase: leaderboard.results?.phase ?? null,
      clock: leaderboard.results?.clock ?? null,
      provisional: leaderboard.results?.provisional ?? null,
    },
    entries: leaderboard.total ?? 0,
    leaderboard: boardRows(leaderboard),
  };

  fs.writeFileSync(path.join(OUT, "leaderboard.json"), `${JSON.stringify(snapshot, null, 2)}\n`);

  // A trimmed health record: enough to prove the deployment was real, without
  // publishing anything that helps someone poke at it.
  fs.writeFileSync(
    path.join(OUT, "health.json"),
    `${JSON.stringify(
      {
        capturedAt: snapshot.capturedAt,
        ok: health.ok,
        store: health.store,
        tables: health.storeDetail,
        ephemeral: health.ephemeral,
        payments: health.payments,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote docs/data/{leaderboard,health}.json from ${BASE}`);
  console.log(`  ${snapshot.entries} entries · cup ${snapshot.cup?.europe ?? "?"}–${snapshot.cup?.usa ?? "?"} · ${snapshot.results.source ?? "no results"}`);
} catch (error) {
  console.error(`Could not snapshot ${BASE}: ${error.message}`);
  console.error("Start the app first (./start.sh), or set BASE to a deployed instance.");
  process.exit(1);
}
