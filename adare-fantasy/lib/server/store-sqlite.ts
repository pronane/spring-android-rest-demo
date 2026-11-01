/**
 * The SQLite backend — one file, or Turso over HTTP.
 *
 * Same document, same tables, same shape as `store-pg.ts`; the difference is the
 * dialect and who is holding the file:
 *
 *  - `LIBSQL_URL=file:./.data/twenty-eight.sqlite` — a single file next to the
 *    app. This is the store for a small server (a €5 VPS, a Railway container, a
 *    Fly machine with a volume): no database service to run, no memory budget to
 *    tune, and a backup is a file copy.
 *  - `LIBSQL_URL=libsql://<db>-<org>.turso.io` + `TURSO_AUTH_TOKEN` — the same
 *    database, hosted, over HTTPS. This is the right answer on a serverless host,
 *    where a file would be thrown away between requests.
 *
 * `DATABASE_URL` may also carry a `libsql:`/`file:`/`sqlite:` URL, so a host that
 * only offers one variable still works. Postgres keeps `DATABASE_URL` for itself.
 *
 * The driver is `@libsql/client`, which speaks both: the local file through a
 * native binding, Turso through HTTP. It is a real SQLite, so `jsonb` becomes
 * TEXT and `timestamptz` becomes an ISO string — `store-shape.ts` normalises
 * both, which is why the rules in db.ts never learn which one is underneath.
 */
import type { Client, InValue } from "@libsql/client";

import {
  COLUMNS,
  DELETE_ORDER,
  INSERT_ORDER,
  JSON_COLUMNS,
  SELECTS,
  TABLES,
  documentFromRows,
  rowsFor,
  type Document,
  type LoginToken,
  type Row,
  type TableName,
} from "./store-shape";

export type { Document, LoginToken } from "./store-shape";

const globalForClient = globalThis as unknown as { __twentyEightLibsql?: Client };

const SQLITE_SCHEMES = new Set(["libsql", "file", "sqlite"]);

function schemeOf(url: string): string {
  return (url.match(/^([a-z0-9+.-]+):/i)?.[1] ?? "").toLowerCase();
}

/**
 * Where the database is, if it is a SQLite one. `LIBSQL_URL` and
 * `TURSO_DATABASE_URL` (the name Turso's own docs use) are both accepted.
 */
export function sqliteUrl(): string | null {
  const explicit = (process.env.LIBSQL_URL ?? process.env.TURSO_DATABASE_URL ?? "").trim();
  if (explicit) return explicit;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl && SQLITE_SCHEMES.has(schemeOf(databaseUrl))) return databaseUrl;
  return null;
}

export function usingSqlite(): boolean {
  return sqliteUrl() !== null;
}

/** True when the database is somewhere else — the distinction that matters on serverless. */
export function sqliteIsRemote(): boolean {
  const url = sqliteUrl();
  return url !== null && (schemeOf(url) === "libsql" || schemeOf(url) === "https" || schemeOf(url) === "http");
}

async function getClient(): Promise<Client> {
  if (globalForClient.__twentyEightLibsql) return globalForClient.__twentyEightLibsql;
  const url = sqliteUrl();
  if (!url) throw new Error("LIBSQL_URL (or TURSO_DATABASE_URL) is not set.");
  // SQLite cannot create a directory, and a first run in a fresh checkout will
  // not have `.data/` yet.
  if (schemeOf(url) === "file") {
    const { mkdir } = await import("node:fs/promises");
    const { dirname, isAbsolute, join } = await import("node:path");
    const file = url.replace(/^file:(\/\/)?/, "");
    const full = isAbsolute(file) ? file : join(process.cwd(), file);
    await mkdir(dirname(full), { recursive: true });
  }
  const { createClient } = await import("@libsql/client");
  const client = createClient({
    url,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  });
  // Foreign keys are off by default in SQLite, per connection. The store deletes
  // children before parents anyway, so this is for humans reading the file.
  if (!sqliteIsRemote()) {
    await client.execute("PRAGMA foreign_keys = ON").catch(() => undefined);
    await client.execute("PRAGMA journal_mode = WAL").catch(() => undefined);
  }
  globalForClient.__twentyEightLibsql = client;
  return client;
}

/** True when the database answers and the schema is present. */
export async function ping(): Promise<{ ok: boolean; detail: string }> {
  try {
    const client = await getClient();
    const result = await client.execute(
      `select count(*) as tables from sqlite_master
        where type = 'table'
          and name in ('users','leagues','orders','ledger','prizes','login_tokens','webhook_events','results')`,
    );
    const tables = Number(result.rows[0]?.tables ?? 0);
    return { ok: tables === 8, detail: `${tables}/8 tables` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function closeClient(): Promise<void> {
  const current = globalForClient.__twentyEightLibsql;
  globalForClient.__twentyEightLibsql = undefined;
  if (current) current.close();
}

/* ——— reading ——— */

export async function readDocument(): Promise<Document> {
  const client = await getClient();
  // One batch, so a remote Turso database answers all eight selects in a single
  // round trip rather than eight.
  const results = await client.batch(
    TABLES.map((table) => SELECTS[table]),
    "read",
  );
  const tables: Partial<Record<TableName, Row[]>> = {};
  TABLES.forEach((table, index) => {
    tables[table] = objectsOf(results[index]);
  });
  return documentFromRows(tables);
}

/* ——— writing ——— */

/**
 * Replaces the whole document in one transaction.
 *
 * SQLite has no `jsonb_to_recordset`, so rows are inserted in batches of
 * `CHUNK` with multi-row `VALUES` — one statement per table for a realistic
 * document, and still one statement for a huge one.
 */
export async function writeDocument(next: Document): Promise<void> {
  const client = await getClient();
  const transaction = await client.transaction("write");
  try {
    for (const table of DELETE_ORDER) {
      await transaction.execute(`delete from ${table}`);
    }

    for (const table of INSERT_ORDER) {
      if (table === "results") continue;
      const rows = rowsFor(table, next);
      const columns = COLUMNS[table];
      for (let start = 0; start < rows.length; start += CHUNK) {
        const slice = rows.slice(start, start + CHUNK);
        const args: InValue[] = [];
        const tuples = slice.map((row) => {
          columns.forEach((column) => args.push(toSqlite(row[column], column)));
          return `(${columns.map(() => "?").join(", ")})`;
        });
        await transaction.execute({
          sql: `insert into ${table} (${columns.join(", ")}) values ${tuples.join(", ")}`,
          args,
        });
      }
    }

    if (next.results) {
      await transaction.execute({
        sql: "insert into results (id, data) values ('current', ?)",
        args: [JSON.stringify(next.results)],
      });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

/**
 * `@libsql/client` returns rows as objects, but a future version (or a proxy in
 * front of Turso) may return positional arrays; the column names are on the
 * result, so both shapes land in the same place.
 */
function objectsOf(result: { rows: unknown[]; columns?: string[] }): Row[] {
  return result.rows.map((row) => {
    if (Array.isArray(row)) {
      const names = result.columns ?? [];
      return Object.fromEntries(names.map((name, index) => [name, row[index]]));
    }
    return row as Row;
  });
}

/** Rows per `INSERT` — well inside SQLite's default parameter limit. */
const CHUNK = 100;

/** SQLite has no boolean and no JSON type; both are conventions. */
function toSqlite(value: unknown, column: string): InValue {
  if (value === null || value === undefined) return null;
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  return JSON.stringify(value);
}
