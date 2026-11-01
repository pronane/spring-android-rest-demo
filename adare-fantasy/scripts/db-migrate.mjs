#!/usr/bin/env node
/**
 * Apply the schema.
 *
 *   node scripts/db-migrate.mjs                     # from DATABASE_URL / LIBSQL_URL
 *   node scripts/db-migrate.mjs --url=postgresql://…
 *   node scripts/db-migrate.mjs --url=file:./.data/twenty-eight.sqlite
 *   node scripts/db-migrate.mjs --url=libsql://mydb-me.turso.io   (needs TURSO_AUTH_TOKEN)
 *   node scripts/db-migrate.mjs --check             # report what is there, change nothing
 *   node scripts/db-migrate.mjs --drop              # destroy the schema first (dev only)
 *
 * Three dialects, two schemas: `db/schema.sql` for Postgres, `db/schema.sqlite.sql`
 * for SQLite and Turso. Both are idempotent, and both record a checksum in
 * `schema_migrations` so you can see which version is deployed. Any additional
 * `db/migrations/*.sql` files are applied in name order, after the schema.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const POSTGRES_SCHEMA = path.join(ROOT, "db", "schema.sql");
const SQLITE_SCHEMA = path.join(ROOT, "db", "schema.sqlite.sql");
const MIGRATIONS = path.join(ROOT, "db", "migrations");

const args = process.argv.slice(2);
const check = args.includes("--check");
const drop = args.includes("--drop");
const urlFlag = args.find((arg) => arg.startsWith("--url="))?.slice("--url=".length);

function fromEnvFile(keys) {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const found = {};
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (match && keys.includes(match[1])) found[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
    if (Object.keys(found).length > 0) return found;
  }
  return {};
}

const fileEnv = fromEnvFile(["DATABASE_URL", "LIBSQL_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]);
const url =
  urlFlag ?? process.env.LIBSQL_URL ?? process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? fileEnv.DATABASE_URL ?? fileEnv.LIBSQL_URL;
const authToken = process.env.TURSO_AUTH_TOKEN ?? fileEnv.TURSO_AUTH_TOKEN;

if (!url) {
  console.error(
    "No database URL.\n\n" +
      "  Postgres — start the bundled one:  npm run db:local -- start\n" +
      "            then put the URL it prints in .env.local as DATABASE_URL=…\n" +
      "  SQLite  — npm run db:migrate -- --url=file:./.data/twenty-eight.sqlite\n" +
      "  Turso   — LIBSQL_URL=libsql://… TURSO_AUTH_TOKEN=… npm run db:migrate\n" +
      "  …or point this at any Postgres with --url=postgresql://user:pass@host:5432/db\n",
  );
  process.exit(2);
}

const scheme = (url.match(/^([a-z0-9+.-]+):/i)?.[1] ?? "").toLowerCase();
const isSqlite = ["libsql", "file", "sqlite"].includes(scheme);
const TABLES = ["users", "leagues", "orders", "ledger", "prizes", "login_tokens", "webhook_events", "results"];

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS)) return [];
  return fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(MIGRATIONS, file));
}

const checksumOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/* ——— SQLite / Turso ——— */

async function migrateSqlite() {
  // SQLite will not create a missing directory, and "unable to open database
  // file" is unhelpful — make the path first.
  if (scheme === "file") {
    const file = url.replace(/^file:(\/\/)?/, "");
    const full = path.isAbsolute(file) ? file : path.join(ROOT, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
  }

  const { createClient } = require("@libsql/client");
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });

  const schemaFile = SQLITE_SCHEMA;
  if (!fs.existsSync(schemaFile)) throw new Error(`missing ${path.relative(ROOT, schemaFile)}`);
  const sql = fs.readFileSync(schemaFile, "utf8");

  const present = await client.execute(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
  );
  const names = new Set(present.rows.map((row) => String(row.name)));
  const missing = TABLES.filter((table) => !names.has(table));

  if (check) {
    console.log(`${names.size} tables in this database; ${TABLES.length - missing.length}/${TABLES.length} from the schema are present.`);
    if (missing.length > 0) {
      console.log(`Missing: ${missing.join(", ")}`);
      console.log('Run "npm run db:migrate" to create them.');
      process.exitCode = 1;
    } else {
      console.log("Schema is present.");
    }
    return;
  }

  if (drop) {
    console.log("Dropping every table (--drop).");
    for (const table of ["schema_migrations", ...TABLES]) {
      await client.execute(`drop table if exists ${table}`);
    }
  }

  // The whole schema is idempotent, so it goes in as one multi-statement run.
  await client.executeMultiple(sql);
  const checksum = checksumOf(sql);

  await client.execute(
    `create table if not exists schema_migrations (
       name text primary key,
       checksum text not null,
       applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     )`,
  );
  await client.execute({
    sql: "insert or replace into schema_migrations (name, checksum) values (?, ?)",
    args: ["schema.sqlite.sql", checksum],
  });

  for (const file of migrationFiles()) {
    const body = fs.readFileSync(file, "utf8");
    await client.executeMultiple(body);
    await client.execute({
      sql: "insert or replace into schema_migrations (name, checksum) values (?, ?)",
      args: [path.basename(file), checksumOf(body)],
    });
    console.log(`applied ${path.relative(ROOT, file)}`);
  }

  const after = await client.execute(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
  );
  console.log(`\nSchema applied (${checksum}) to ${isRemote ? "Turso" : url.replace(/^file:/, "")}. ${after.rows.length} tables:`);
  console.log(`  ${after.rows.map((row) => row.name).join(", ")}`);

  client.close();
}

const isRemote = scheme === "libsql" || scheme === "https" || scheme === "http";

/* ——— Postgres ——— */

async function migratePostgres() {
  const { Client } = require("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

  try {
    await client.connect();
  } catch (error) {
    console.error(`Could not connect to Postgres: ${error.message}\n`);
    console.error("Is it running?  npm run db:local -- status");
    process.exit(1);
  }

  try {
    const present = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
    );
    const names = new Set(present.rows.map((row) => row.table_name));
    const missing = TABLES.filter((table) => !names.has(table));

    if (check) {
      console.log(`${names.size} tables in this database; ${TABLES.length - missing.length}/${TABLES.length} from the schema are present.`);
      if (missing.length > 0) {
        console.log(`Missing: ${missing.join(", ")}`);
        console.log('Run "npm run db:migrate" to create them.');
        process.exitCode = 1;
      } else {
        console.log("Schema is present.");
      }
      return;
    }

    await client.query("begin");
    try {
      if (drop) {
        console.log("Dropping the public schema (--drop).");
        await client.query("drop schema public cascade; create schema public;");
      }

      const sql = fs.readFileSync(POSTGRES_SCHEMA, "utf8");
      await client.query(sql);
      const checksum = checksumOf(sql);

      await client.query(
        `create table if not exists schema_migrations (
           name text primary key,
           checksum text not null,
           applied_at timestamptz not null default now()
         )`,
      );
      await client.query(
        `insert into schema_migrations (name, checksum) values ($1, $2)
         on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`,
        ["schema.sql", checksum],
      );

      for (const file of migrationFiles()) {
        const body = fs.readFileSync(file, "utf8");
        await client.query(body);
        await client.query(
          `insert into schema_migrations (name, checksum) values ($1, $2)
           on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`,
          [path.basename(file), checksumOf(body)],
        );
        console.log(`applied ${path.relative(ROOT, file)}`);
      }

      await client.query("commit");

      const after = await client.query(
        "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
      );
      console.log(`\nSchema applied (${checksum}). ${after.rows.length} tables:`);
      console.log(`  ${after.rows.map((row) => row.table_name).join(", ")}`);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
  } finally {
    await client.end();
  }
}

try {
  if (isSqlite) {
    await migrateSqlite();
  } else {
    await migratePostgres();
  }
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
}
