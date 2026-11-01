/**
 * The Postgres backend.
 *
 * `lib/server/db.ts` owns the rules; this file only moves the document in and
 * out of the tables in `db/schema.sql`. It is selected by `DATABASE_URL`: with
 * the variable unset the app uses the JSON file in `.data/`, so a clone still
 * runs with no database at all.
 *
 * The read-modify-write shape is deliberate. The file backend under it is one
 * JSON document, and every exported function in db.ts works on that document in
 * memory; keeping the same shape here means the two backends cannot drift, and
 * the payment, prize and referral rules are tested once. Writes are one
 * transaction, taken under an advisory lock, so two app processes cannot
 * interleave a write — but this is a single-instance store: a real deployment
 * would move each collection's queries into SQL (the indexes are already there).
 */
import type { Pool, PoolClient } from "pg";

import type { Db, LedgerRow, Order, PrizeAward, ServerLeague, User } from "./db";

export type LoginToken = { hash: string; userId: string; expiresAt: string; used: boolean };

export type Document = {
  users: User[];
  leagues: ServerLeague[];
  loginTokens: LoginToken[];
  orders: Order[];
  ledger: LedgerRow[];
  prizes: PrizeAward[];
  webhookEvents: string[];
  results?: Db["results"];
};

/** Arbitrary, stable key for `pg_advisory_xact_lock`. */
const LOCK_KEY = 28_202_709;

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : typeof value === "string" ? value : new Date(String(value)).toISOString();
const isoOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : iso(value));

/** Bigint columns come back as strings; the app counts in plain numbers. */
const cents = (value: unknown): number => Number(value ?? 0);

let pool: Pool | null = null;

/** Kept on globalThis so a dev-server reload reuses the connections. */
const globalForPool = globalThis as unknown as { __twentyEightPool?: Pool };

export function postgresUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : null;
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
  {
    const [users, leagues, loginTokens, orders, ledger, prizes, webhookEvents, results] = await Promise.all([
      pool.query("select id, email, manager, team_name, created_at, entry, identities from users order by created_at, id"),
      pool.query("select id, name, code, owner_id, buy_in, member_ids, created_at from leagues order by created_at, id"),
      pool.query("select hash, user_id, expires_at, used from login_tokens"),
      pool.query("select * from orders order by created_at, ref"),
      pool.query("select * from ledger order by at, id"),
      pool.query("select * from prizes order by settled_at, id"),
      pool.query("select id from webhook_events"),
      pool.query("select data from results where id = 'current'"),
    ]);

    return {
      users: users.rows.map((row) => ({
        id: row.id,
        email: row.email,
        manager: row.manager,
        teamName: row.team_name,
        createdAt: iso(row.created_at),
        ...(row.entry ? { entry: row.entry } : {}),
        ...(Array.isArray(row.identities) && row.identities.length > 0 ? { identities: row.identities } : {}),
      })),
      leagues: leagues.rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        ownerId: row.owner_id,
        buyIn: Number(row.buy_in ?? 0),
        memberIds: Array.isArray(row.member_ids) ? row.member_ids : [],
        createdAt: iso(row.created_at),
      })),
      loginTokens: loginTokens.rows.map((row) => ({
        hash: row.hash,
        userId: row.user_id,
        expiresAt: iso(row.expires_at),
        used: row.used,
      })),
      orders: orders.rows.map((row) => ({
        ref: row.ref,
        userId: row.user_id,
        email: row.email,
        planId: row.plan_id,
        planName: row.plan_name,
        amountCents: cents(row.amount_cents),
        currency: row.currency,
        editionId: row.edition_id,
        prizeEligible: row.prize_eligible,
        status: row.status,
        provider: row.provider,
        ...(row.referral_code ? { referralCode: row.referral_code } : {}),
        providerRef: row.provider_ref ?? null,
        createdAt: iso(row.created_at),
        paidAt: isoOrNull(row.paid_at),
        refundedAt: isoOrNull(row.refunded_at),
        ...(row.note ? { note: row.note } : {}),
      })),
      ledger: ledger.rows.map((row) => ({
        id: row.id,
        at: iso(row.at),
        kind: row.kind,
        amountCents: cents(row.amount_cents),
        editionId: row.edition_id,
        orderRef: row.order_ref ?? null,
        userId: row.user_id ?? null,
        memo: row.memo,
      })),
      prizes: prizes.rows.map((row) => ({
        id: row.id,
        editionId: row.edition_id,
        leagueId: row.league_id ?? null,
        potCents: cents(row.pot_cents),
        userId: row.user_id,
        teamName: row.team_name,
        place: Number(row.place),
        label: row.label,
        amountCents: cents(row.amount_cents),
        status: row.status,
        settledAt: iso(row.settled_at),
        paidAt: isoOrNull(row.paid_at),
      })),
      webhookEvents: webhookEvents.rows.map((row) => row.id),
      ...(results.rows[0]?.data ? { results: results.rows[0].data as Db["results"] } : {}),
    };
  }
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
      // Children first: the foreign keys are there to catch a bug, not to make
      // the replace awkward.
      for (const table of ["login_tokens", "prizes", "ledger", "orders", "leagues", "webhook_events", "results", "users"]) {
        await client.query(`delete from ${table}`);
      }

      await insertMany(client, "users", next.users, (user) => ({
        id: user.id,
        email: user.email,
        manager: user.manager,
        team_name: user.teamName,
        created_at: user.createdAt,
        entry: user.entry ?? null,
        identities: user.identities ?? [],
      }));

      await insertMany(client, "leagues", next.leagues, (league) => ({
        id: league.id,
        name: league.name,
        code: league.code,
        owner_id: league.ownerId,
        buy_in: league.buyIn ?? 0,
        member_ids: league.memberIds ?? [],
        created_at: league.createdAt,
      }));

      await insertMany(client, "orders", next.orders, (order) => ({
        ref: order.ref,
        user_id: order.userId,
        email: order.email,
        plan_id: order.planId,
        plan_name: order.planName,
        amount_cents: order.amountCents,
        currency: order.currency,
        edition_id: order.editionId,
        prize_eligible: order.prizeEligible ?? false,
        status: order.status,
        provider: order.provider,
        referral_code: order.referralCode ?? null,
        provider_ref: order.providerRef ?? null,
        created_at: order.createdAt,
        paid_at: order.paidAt ?? null,
        refunded_at: order.refundedAt ?? null,
        note: order.note ?? null,
      }));

      await insertMany(client, "ledger", next.ledger, (row) => ({
        id: row.id,
        at: row.at,
        kind: row.kind,
        amount_cents: row.amountCents,
        edition_id: row.editionId,
        order_ref: row.orderRef ?? null,
        user_id: row.userId ?? null,
        memo: row.memo,
      }));

      await insertMany(client, "prizes", next.prizes, (prize) => ({
        id: prize.id,
        edition_id: prize.editionId,
        league_id: prize.leagueId ?? null,
        pot_cents: prize.potCents,
        user_id: prize.userId,
        team_name: prize.teamName,
        place: prize.place,
        label: prize.label,
        amount_cents: prize.amountCents,
        status: prize.status,
        settled_at: prize.settledAt,
        paid_at: prize.paidAt ?? null,
      }));

      await insertMany(client, "login_tokens", next.loginTokens, (token) => ({
        hash: token.hash,
        user_id: token.userId,
        expires_at: token.expiresAt,
        used: token.used,
      }));

      await insertMany(client, "webhook_events", next.webhookEvents, (id) => ({ id }));

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

async function insertMany<T>(
  client: PoolClient,
  table: string,
  rows: T[],
  shape: (row: T) => Record<string, unknown>,
): Promise<void> {
  if (rows.length === 0) return;
  const payload = JSON.stringify(rows.map(shape));
  const columns = Object.keys(shape(rows[0]));
  await client.query(
    `insert into ${table} (${columns.join(", ")})
     select ${columns.join(", ")} from jsonb_to_recordset($1::jsonb)
       as x(${columns.map((column) => `${column} ${columnType(table, column)}`).join(", ")})`,
    [payload],
  );
}

/**
 * The recordset definition has to be typed, and it is the one place where a
 * column type is written twice (here and in schema.sql) — `db-check` runs a row
 * of every shape through both backends, so a mismatch fails the build.
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
