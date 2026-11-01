#!/usr/bin/env node
/**
 * Creates (or updates) the Postgres schema — the tables the app reads and
 * writes when `DATABASE_URL` is set.
 *
 *   node scripts/db-migrate.mjs            # apply db/schema.sql
 *   node scripts/db-migrate.mjs --check    # report what is there, change nothing
 *   node scripts/db-migrate.mjs --drop     # drop the public schema first (dev only)
 *
 * The connection string comes from `--url`, then `DATABASE_URL`, then
 * `.env.local`. `db/schema.sql` is written to be idempotent, so this is safe to
 * run on every install, every deploy, and twice in a row.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const SCHEMA = path.join(ROOT, "db", "schema.sql");
const MIGRATIONS = path.join(ROOT, "db", "migrations");

const args = process.argv.slice(2);
const check = args.includes("--check");
const drop = args.includes("--drop");
const urlFlag = args.find((arg) => arg.startsWith("--url="))?.slice("--url=".length);

function fromEnvFile() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (match) return match[1].replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

const url = urlFlag ?? process.env.DATABASE_URL ?? fromEnvFile();
if (!url) {
  console.error(
    "No DATABASE_URL.\n\n" +
      "  Start the bundled Postgres:   npm run db:local -- start\n" +
      "  Then put the URL it prints in .env.local as DATABASE_URL=…\n" +
      "  …or point this at any Postgres with --url=postgresql://user:pass@host:5432/db\n",
  );
  process.exit(2);
}

const { Client } = require("pg");
const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

function migrationFiles() {
  // Any additional migrations ship as db/migrations/*.sql, applied in order.
  if (!fs.existsSync(MIGRATIONS)) return [];
  return fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(MIGRATIONS, file));
}

const TABLES = ["users", "leagues", "orders", "ledger", "prizes", "login_tokens", "webhook_events", "results"];

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
      console.log("Run \"npm run db:migrate\" to create them.");
      process.exitCode = 1;
    } else {
      console.log("Schema is present.");
    }
  } else {
    await client.query("begin");
    try {
      if (drop) {
        console.log("Dropping the public schema (--drop).");
        await client.query("drop schema public cascade; create schema public;");
      }

      const sql = fs.readFileSync(SCHEMA, "utf8");
      await client.query(sql);
      const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);

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
        const fileChecksum = createHash("sha256").update(body).digest("hex").slice(0, 16);
        await client.query(body);
        await client.query(
          `insert into schema_migrations (name, checksum) values ($1, $2)
           on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`,
          [path.basename(file), fileChecksum],
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
  }
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
