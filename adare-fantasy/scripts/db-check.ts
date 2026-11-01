/**
 * The Postgres backend, end to end, on a throwaway cluster.
 *
 *   npm run db:check
 *
 * It starts a real Postgres from the bundled binaries (no admin, no server of
 * your own), applies `db/schema.sql`, points the app at it and then runs the
 * shared store contract in `scripts/store-contract.ts` — the same assertions
 * `db:check:sqlite` runs.
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { fail, runStoreContract, summarise, type StoreProbe } from "./store-contract";

const ROOT = process.cwd();
const DATA_DIR = ".data/pg-check";
const PORT = Number(process.env.PG_CHECK_PORT ?? 54339);
const CREDENTIALS = ".data/pg-check-credentials.json";

const node = process.execPath;
const localDb = (...args: string[]) =>
  execFileSync(node, [path.join(ROOT, "scripts", "local-db.mjs"), ...args], {
    cwd: ROOT,
    env: { ...process.env, PGDATA_DIR: DATA_DIR, PGPORT: String(PORT), PGCREDENTIALS_FILE: CREDENTIALS },
    encoding: "utf8",
  });

async function main() {
  // A cluster of our own, so this can run beside a real one.
  console.log(`starting a throwaway Postgres in ${DATA_DIR} on port ${PORT}…\n`);
  await fs.rm(path.join(ROOT, DATA_DIR), { recursive: true, force: true });
  await fs.rm(path.join(ROOT, CREDENTIALS), { force: true });
  localDb("start");

  const creds = JSON.parse(await fs.readFile(path.join(ROOT, CREDENTIALS), "utf8"));
  const url = `postgresql://${creds.user}:${encodeURIComponent(creds.password)}@127.0.0.1:${creds.port}/${creds.database}`;
  // The app's own selection logic, exercised for real: DATABASE_URL and nothing else.
  delete process.env.LIBSQL_URL;
  delete process.env.TURSO_DATABASE_URL;
  process.env.DATABASE_URL = url;

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();

  // Schema, exactly as the installer applies it.
  await client.query(await fs.readFile(path.join(ROOT, "db", "schema.sql"), "utf8"));

  const probe: StoreProbe = {
    label: "Postgres",
    backend: "postgres",
    tableNames: async () => {
      const tables = await client.query(
        "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations' order by table_name",
      );
      return tables.rows.map((row) => row.table_name);
    },
    counts: async () => {
      const counts = await client.query(`
        select (select count(*) from users)::int as users,
               (select count(*) from leagues)::int as leagues,
               (select count(*) from orders)::int as orders,
               (select count(*) from ledger)::int as ledger,
               (select count(*) from prizes)::int as prizes,
               (select count(*) from login_tokens)::int as tokens,
               (select count(*) from webhook_events)::int as events,
               (select count(*) from results)::int as results
      `);
      return counts.rows[0];
    },
    userColumns: async () => {
      const columns = await client.query(
        "select column_name from information_schema.columns where table_name = 'users' order by ordinal_position",
      );
      return columns.rows.map((row) => row.column_name);
    },
    identityProvider: async (userId: string) => {
      const identity = await client.query("select identities->0->>'provider' as provider from users where id = $1", [userId]);
      return identity.rows[0]?.provider ?? null;
    },
    ping: async () => {
      const { ping } = await import("../lib/server/store-pg");
      return ping();
    },
  };

  const result = await runStoreContract(probe);

  await client.end();
  // The app's pool is still open; close it before the server goes away, or the
  // connection errors land on the process rather than in a log.
  const { closePool } = await import("../lib/server/store-pg");
  await closePool();
  localDb("stop");
  await fs.rm(path.join(ROOT, DATA_DIR), { recursive: true, force: true });
  await fs.rm(path.join(ROOT, CREDENTIALS), { force: true });

  summarise("Postgres", result);
}

main().catch(async (error) => {
  fail(error);
  try {
    localDb("stop");
  } catch {
    /* the cluster may never have started */
  }
});
