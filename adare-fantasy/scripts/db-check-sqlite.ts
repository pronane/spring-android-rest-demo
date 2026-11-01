/**
 * The SQLite (and Turso) backend, end to end.
 *
 *   npm run db:check:sqlite                     # a throwaway file in .data/
 *   LIBSQL_URL=libsql://… TURSO_AUTH_TOKEN=… npm run db:check:sqlite   # a real Turso database
 *   DB_CHECK_SQLITE=file:/tmp/t.db npm run db:check:sqlite             # or name the file
 *
 * Same contract as `npm run db:check` — the same assertions, the same document,
 * a different dialect. Against a Turso database this is a real integration test:
 * it writes, reads back and empties whatever you point it at, so give it a
 * database you do not mind losing.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { fail, runStoreContract, summarise, type StoreProbe } from "./store-contract";

const ROOT = process.cwd();
const FILE = process.env.DB_CHECK_SQLITE ?? "file:.data/sqlite-check/twenty-eight.sqlite";
const remoteUrl = process.env.LIBSQL_URL ?? process.env.TURSO_DATABASE_URL;
const url = remoteUrl ?? FILE;

async function main() {
  if (remoteUrl) {
    console.log(`checking the Turso database at ${new URL(remoteUrl).host}…`);
    console.log("(this empties every table it touches)\n");
  } else {
    const filePath = FILE.replace(/^file:/, "");
    const full = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
    await fs.rm(full, { force: true });
    await fs.rm(`${full}-wal`, { force: true });
    await fs.rm(`${full}-shm`, { force: true });
    await fs.mkdir(path.dirname(full), { recursive: true });
    console.log(`using a throwaway SQLite file at ${path.relative(ROOT, full)}…\n`);
  }

  // The app's own selection logic, exercised for real.
  delete process.env.DATABASE_URL;
  process.env.LIBSQL_URL = url;

  const { createClient } = await import("@libsql/client");
  const client = createClient({
    url,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  });

  // Schema, exactly as `npm run db:migrate` applies it.
  await client.executeMultiple(await fs.readFile(path.join(ROOT, "db", "schema.sqlite.sql"), "utf8"));

  const probe: StoreProbe = {
    label: "SQLite",
    backend: remoteUrl ? "turso" : "sqlite",
    tableNames: async () => {
      const tables = await client.execute(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> 'schema_migrations' order by name",
      );
      return tables.rows.map((row) => String(row.name));
    },
    counts: async () => {
      const counts = await client.execute(`
        select (select count(*) from users) as users,
               (select count(*) from leagues) as leagues,
               (select count(*) from orders) as orders,
               (select count(*) from ledger) as ledger,
               (select count(*) from prizes) as prizes,
               (select count(*) from login_tokens) as tokens,
               (select count(*) from webhook_events) as events,
               (select count(*) from results) as results
      `);
      const row = counts.rows[0] as Record<string, unknown>;
      return {
        users: Number(row.users),
        leagues: Number(row.leagues),
        orders: Number(row.orders),
        ledger: Number(row.ledger),
        prizes: Number(row.prizes),
        tokens: Number(row.tokens),
        events: Number(row.events),
        results: Number(row.results),
      };
    },
    userColumns: async () => {
      const columns = await client.execute("select name from pragma_table_info('users') order by cid");
      return columns.rows.map((row) => String(row.name));
    },
    identityProvider: async (userId: string) => {
      const identity = await client.execute({
        sql: "select json_extract(identities, '$[0].provider') as provider from users where id = ?",
        args: [userId],
      });
      const value = identity.rows[0]?.provider;
      return value === null || value === undefined ? null : String(value);
    },
    ping: async () => {
      const { ping } = await import("../lib/server/store-sqlite");
      return ping();
    },
  };

  const result = await runStoreContract(probe);

  const { closeClient } = await import("../lib/server/store-sqlite");
  await closeClient();
  client.close();

  if (!remoteUrl) {
    const filePath = FILE.replace(/^file:/, "");
    const full = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
    await fs.rm(full, { force: true });
    await fs.rm(`${full}-wal`, { force: true });
    await fs.rm(`${full}-shm`, { force: true });
  }

  summarise("SQLite", result);
}

main().catch(fail);
