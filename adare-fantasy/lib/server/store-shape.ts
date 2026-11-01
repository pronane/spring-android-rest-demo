/**
 * One description of the document, shared by every SQL backend.
 *
 * The store is a document — seven collections and one singleton — and both SQL
 * adapters (`store-pg.ts`, `store-sqlite.ts`) move exactly that document in and
 * out of the same eight tables. The column names, the select lists and the row
 * shape live here so adding a column is one edit rather than three, and so a
 * value written by Postgres reads back identically from SQLite.
 *
 * Values arriving from a driver are loosely typed on purpose: Postgres hands
 * back `Date`, `boolean` and already-parsed JSON; SQLite hands back strings and
 * integers. Both are normalised here, which is why the mapping can be shared at
 * all.
 */
import type { Db, LedgerRow, Order, PrizeAward, ServerLeague, User } from "./db";

export type Row = Record<string, unknown>;

export type LoginToken = { hash: string; userId: string; expiresAt: string; used: boolean };

/** The whole store, in memory. `lib/server/db.ts` owns the rules that act on it. */
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

export const TABLES = [
  "users",
  "leagues",
  "login_tokens",
  "orders",
  "ledger",
  "prizes",
  "webhook_events",
  "results",
] as const;

export type TableName = (typeof TABLES)[number];

/** Children before parents: the foreign keys exist to catch a bug, not to make a replace awkward. */
export const DELETE_ORDER: TableName[] = [
  "login_tokens",
  "prizes",
  "ledger",
  "orders",
  "leagues",
  "webhook_events",
  "results",
  "users",
];

export const SELECTS: Record<TableName, string> = {
  users: "select id, email, manager, team_name, created_at, entry, identities from users order by created_at, id",
  leagues: "select id, name, code, owner_id, buy_in, member_ids, created_at from leagues order by created_at, id",
  login_tokens: "select hash, user_id, expires_at, used from login_tokens",
  orders: "select * from orders order by created_at, ref",
  ledger: "select * from ledger order by at, id",
  prizes: "select * from prizes order by settled_at, id",
  webhook_events: "select id from webhook_events",
  results: "select data from results where id = 'current'",
};

/** Parents before children, so a foreign key never sees a row it cannot resolve. */
export const INSERT_ORDER: TableName[] = [...DELETE_ORDER].reverse();

/** Insert columns, in the order `rowsFor` produces values. */
export const COLUMNS: Record<Exclude<TableName, "results">, string[]> = {
  users: ["id", "email", "manager", "team_name", "created_at", "entry", "identities"],
  leagues: ["id", "name", "code", "owner_id", "buy_in", "member_ids", "created_at"],
  orders: [
    "ref",
    "user_id",
    "email",
    "plan_id",
    "plan_name",
    "amount_cents",
    "currency",
    "edition_id",
    "prize_eligible",
    "status",
    "provider",
    "referral_code",
    "provider_ref",
    "created_at",
    "paid_at",
    "refunded_at",
    "note",
  ],
  ledger: ["id", "at", "kind", "amount_cents", "edition_id", "order_ref", "user_id", "memo"],
  prizes: [
    "id",
    "edition_id",
    "league_id",
    "pot_cents",
    "user_id",
    "team_name",
    "place",
    "label",
    "amount_cents",
    "status",
    "settled_at",
    "paid_at",
  ],
  login_tokens: ["hash", "user_id", "expires_at", "used"],
  webhook_events: ["id"],
};

/* ——— normalising what a driver hands back ——— */

export const iso = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === "string"
      ? value
      : value === null || value === undefined
        ? new Date(0).toISOString()
        : new Date(String(value)).toISOString();

export const isoOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : iso(value));

/** Bigint and integer columns both come back as strings from some drivers. */
export const num = (value: unknown): number => Number(value ?? 0);

export const bool = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "true";

/** `jsonb` arrives parsed; SQLite stores JSON as text. */
export function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/* ——— rows → document ——— */

export function documentFromRows(tables: Partial<Record<TableName, Row[]>>): Document {
  const users: User[] = (tables.users ?? []).map((row) => {
    const entry = json<Record<string, unknown> | null>(row.entry, null);
    const identities = json<unknown[]>(row.identities, []);
    return {
      id: String(row.id),
      email: String(row.email),
      manager: String(row.manager),
      teamName: String(row.team_name),
      createdAt: iso(row.created_at),
      ...(entry ? { entry: entry as User["entry"] } : {}),
      ...(Array.isArray(identities) && identities.length > 0 ? { identities: identities as User["identities"] } : {}),
    };
  });

  const leagues: ServerLeague[] = (tables.leagues ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    ownerId: String(row.owner_id),
    buyIn: num(row.buy_in),
    memberIds: json<string[]>(row.member_ids, []),
    createdAt: iso(row.created_at),
  }));

  const loginTokens: LoginToken[] = (tables.login_tokens ?? []).map((row) => ({
    hash: String(row.hash),
    userId: String(row.user_id),
    expiresAt: iso(row.expires_at),
    used: bool(row.used),
  }));

  const orders: Order[] = (tables.orders ?? []).map((row) => ({
    ref: String(row.ref),
    userId: String(row.user_id),
    email: String(row.email),
    planId: String(row.plan_id),
    planName: String(row.plan_name),
    amountCents: num(row.amount_cents),
    currency: String(row.currency),
    editionId: String(row.edition_id),
    prizeEligible: bool(row.prize_eligible),
    status: row.status as Order["status"],
    provider: row.provider as Order["provider"],
    ...(row.referral_code ? { referralCode: String(row.referral_code) } : {}),
    providerRef: row.provider_ref ? String(row.provider_ref) : null,
    createdAt: iso(row.created_at),
    paidAt: isoOrNull(row.paid_at),
    refundedAt: isoOrNull(row.refunded_at),
    ...(row.note ? { note: String(row.note) } : {}),
  }));

  const ledger: LedgerRow[] = (tables.ledger ?? []).map((row) => ({
    id: String(row.id),
    at: iso(row.at),
    kind: row.kind as LedgerRow["kind"],
    amountCents: num(row.amount_cents),
    editionId: String(row.edition_id),
    orderRef: row.order_ref ? String(row.order_ref) : null,
    userId: row.user_id ? String(row.user_id) : null,
    memo: String(row.memo),
  }));

  const prizes: PrizeAward[] = (tables.prizes ?? []).map((row) => ({
    id: String(row.id),
    editionId: String(row.edition_id),
    leagueId: row.league_id ? String(row.league_id) : null,
    potCents: num(row.pot_cents),
    userId: String(row.user_id),
    teamName: String(row.team_name),
    place: num(row.place),
    label: String(row.label),
    amountCents: num(row.amount_cents),
    status: row.status as PrizeAward["status"],
    settledAt: iso(row.settled_at),
    paidAt: isoOrNull(row.paid_at),
  }));

  const results = json<Db["results"] | null>(tables.results?.[0]?.data, null);

  return {
    users,
    leagues,
    loginTokens,
    orders,
    ledger,
    prizes,
    webhookEvents: (tables.webhook_events ?? []).map((row) => String(row.id)),
    ...(results ? { results } : {}),
  };
}

/* ——— document → rows ——— */

/** A plain object per row, keyed by column name. Drivers convert as they see fit. */
export function rowsFor(table: Exclude<TableName, "results">, doc: Document): Row[] {
  switch (table) {
    case "users":
      return doc.users.map((user) => ({
        id: user.id,
        email: user.email,
        manager: user.manager,
        team_name: user.teamName,
        created_at: user.createdAt,
        entry: user.entry ?? null,
        identities: user.identities ?? [],
      }));
    case "leagues":
      return doc.leagues.map((league) => ({
        id: league.id,
        name: league.name,
        code: league.code,
        owner_id: league.ownerId,
        buy_in: league.buyIn ?? 0,
        member_ids: league.memberIds ?? [],
        created_at: league.createdAt,
      }));
    case "orders":
      return doc.orders.map((order) => ({
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
    case "ledger":
      return doc.ledger.map((row) => ({
        id: row.id,
        at: row.at,
        kind: row.kind,
        amount_cents: row.amountCents,
        edition_id: row.editionId,
        order_ref: row.orderRef ?? null,
        user_id: row.userId ?? null,
        memo: row.memo,
      }));
    case "prizes":
      return doc.prizes.map((prize) => ({
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
    case "login_tokens":
      return doc.loginTokens.map((token) => ({
        hash: token.hash,
        user_id: token.userId,
        expires_at: token.expiresAt,
        used: token.used,
      }));
    case "webhook_events":
      return doc.webhookEvents.map((id) => ({ id }));
  }
}

/** The JSON-shaped columns, which a driver with real types (Postgres) inserts as text. */
export const JSON_COLUMNS = new Set(["entry", "identities", "member_ids"]);
