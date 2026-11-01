/**
 * The Postgres backend.
 *
 * `lib/server/db.ts` owns the rules; this file only moves the document in and
 * out of the tables in `db/schema.sql`. It is selected by `DATABASE_URL` (with a
 * `postgres://` scheme); with no database at all the app uses the JSON file in
 * `.data/`, so a clone still runs with nothing installed.
 *
 * The read-modify-write shape is deliberate. The file backend under it is one
 * JSON document, and every exported function in db.ts works on that document in
 * memory; keeping the same shape here means the backends cannot drift, and the
 * payment, prize and referral rules are tested once. Writes are one transaction,
 * taken under an advisory lock, so two app processes cannot interleave a write —
 * but this is a single-instance store: a real deployment would move each
 * collection's queries into SQL (the indexes are already there).
 */
import type { Pool, PoolClient } from "pg";

import {
  COLUMNS,
  DELETE_ORDER,
  INSERT_ORDER,
  SELECTS,
  TABLES,
  documentFromRows,
  rowsFor,
  type Document,
  type Row,
  type TableName,
} from "./store-shape";

export { type Document, type LoginToken } from "./store-shape";

/** Arbitrary, stable key for `pg_advisory_xact_lock`. */
const LOCK_KEY = 28_202_709;

let pool: Pool | null = null;

/** Kept on globalThis so a dev-server reload reuses the connections. */
const globalForPool = globalThis as unknown as { __twentyEightPool?: Pool };

/** The URL's scheme, lower-cased; empty when there isn't one. */
export const schemeOf = (url: string): string => (url.match(/^([a-z0-9+.-]+):/i)?.[1] ?? "").toLowerCase();

export function postgresUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  // `DATABASE_URL=libsql://…` or `file:…` belongs to the SQLite backend. Anything
  // else — postgres://, postgresql://, or a bare DSN — is ours.
  const scheme = schemeOf(url);
  if (scheme === "libsql" || scheme === "file" || scheme === "sqlite" || scheme === "http" || scheme === "https") return null;
  return url;
}

export function usingPostgres(): boolean {
  return postgresUrl() !== null;
}

async function getPool(): Promise<Pool> {
  if (globalForPool.__twentyEightPool) return globalForPool.__twentyEightPool;
  if (pool) return pool;
  const url = postgresUrl();
  if (!url) throw new Error("DATABASE_URL is not set.");
  const { Pool: PgPool } = await import("pg");
  pool = new PgPool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  globalForPool.__twentyEightPool = pool;
  return pool;
}

/** True when the database answers and the schema is present. */
export async function ping(): Promise<{ ok: boolean; detail: string }> {
  try {
    const client = await (await getPool()).connect();
    try {
      const { rows } = await client.query(
        "select count(*)::int as tables from information_schema.tables where table_schema = 'public' and table_name in ('users','leagues','orders','ledger','prizes','login_tokens','webhook_events','results')",
      );
      const tables = rows[0]?.tables ?? 0;
      return { ok: tables === 8, detail: `${tables}/8 tables` };
    } finally {
      client.release();
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function closePool(): Promise<void> {
  const current = globalForPool.__twentyEightPool ?? pool;
  globalForPool.__twentyEightPool = undefined;
  pool = null;
  if (current) await current.end();
}

/* ——— reading ——— */

export async function readDocument(): Promise<Document> {
  // One query per table, issued on the pool rather than a single client: they
  // run in parallel on separate connections, which node-postgres requires.
  const pool = await getPool();
  const entries = await Promise.all(TABLES.map((table) => pool.query(SELECTS[table])));
  const tables: Partial<Record<TableName, Row[]>> = {};
  TABLES.forEach((table, index) => {
    tables[table] = entries[index].rows as Row[];
  });
  return documentFromRows(tables);
}

/* ——— writing ——— */

/**
 * Replaces the whole document in one transaction.
 *
 * `jsonb_to_recordset` keeps this to eight statements regardless of how many
 * rows there are, and the advisory lock means a second process waits rather
 * than writing a document read before the first one landed.
 */
export async function writeDocument(next: Document): Promise<void> {
  const client = await (await getPool()).connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    try {
      for (const table of DELETE_ORDER) {
        await client.query(`delete from ${table}`);
      }

      for (const table of INSERT_ORDER) {
        if (table === "results") continue;
        await insertMany(client, table, rowsFor(table, next), COLUMNS[table]);
      }

      if (next.results) {
        await client.query("insert into results (id, data) values ('current', $1::jsonb)", [JSON.stringify(next.results)]);
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  } finally {
    client.release();
  }
}

async function insertMany(client: PoolClient, table: string, rows: Row[], columns: string[]): Promise<void> {
  if (rows.length === 0) return;
  const payload = JSON.stringify(rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))));
  await client.query(
    `insert into ${table} (${columns.join(", ")})
     select ${columns.join(", ")} from jsonb_to_recordset($1::jsonb)
       as x(${columns.map((column) => `${column} ${columnType(table, column)}`).join(", ")})`,
    [payload],
  );
}

/**
 * The recordset definition has to be typed, and it is the one place where a
 * column type is written twice (here and in schema.sql) — `db:check` runs a row
 * of every shape through both SQL backends, so a mismatch fails the build.
 */
function columnType(table: string, column: string): string {
  const timestamps = new Set(["created_at", "paid_at", "refunded_at", "at", "settled_at", "expires_at"]);
  const json = new Set(["entry", "identities", "member_ids"]);
  const integers = new Set(["amount_cents", "pot_cents", "buy_in", "place"]);
  const booleans = new Set(["prize_eligible", "used"]);
  if (timestamps.has(column)) return "timestamptz";
  if (json.has(column)) return "jsonb";
  if (booleans.has(column)) return "boolean";
  if (integers.has(column)) return column === "place" || column === "buy_in" ? "integer" : "bigint";
  if (table === "results") return "jsonb";
  return "text";
}
