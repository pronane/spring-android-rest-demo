/**
 * Tiny JSON-file store so the demo has a real backend (accounts, paid entries,
 * saved cards) without needing Postgres. Swap the four functions below for
 * Prisma/Postgres in production — nothing else in the app touches storage.
 *
 * Note: serverless filesystems are ephemeral; deploy the v1 API against a
 * managed database. See README → "Roadmap to v1".
 */
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ResultsOverride } from "@/lib/scoring";
import { allocate } from "@/lib/server/money";

export type User = {
  id: string;
  email: string;
  manager: string;
  teamName: string;
  createdAt: string;
  entry?: Entry;
};

export type Entry = {
  ref: string;
  plan: string;
  amount: number;
  paidAt: string;
  editionId: string;
  mode?: "classic" | "full";
  squad?: string[];
  captain?: string | null;
  predictions?: Record<string, string>;
  awards?: { mvp: string | null; topScorer: string | null; rookie: string | null };
  pinpoint?: Record<string, { pin: number | null; drive: number | null }>;
  /** Only entries bought on a prize-eligible plan can win anything. */
  prizeEligible?: boolean;
  updatedAt?: string;
};

/** A private league shared between real accounts (previously browser-only). */
export type ServerLeague = {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  buyIn: number;
  memberIds: string[];
  createdAt: string;
};

/**
 * A payment attempt. The entry is only created once an order reaches `paid`, so
 * "paid entry" means "an order settled", not "someone filled in a form".
 */
export type Order = {
  ref: string;
  userId: string;
  email: string;
  planId: string;
  planName: string;
  amountCents: number;
  currency: string;
  editionId: string;
  prizeEligible: boolean;
  status: "pending" | "paid" | "failed" | "refunded";
  provider: "demo" | "stripe";
  /** Stripe checkout session id, when there is one. */
  providerRef: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  note?: string;
};

/**
 * Every movement of money, in cents. One payment writes three rows (the cash in,
 * the platform's share, the pool's share), which is what makes the totals on the
 * admin page add up to the money the demo claims to have taken.
 */
export type LedgerRow = {
  id: string;
  at: string;
  kind: "entry_fee" | "platform_fee" | "prize_pool" | "refund" | "prize_payout";
  amountCents: number;
  editionId: string;
  orderRef: string | null;
  userId: string | null;
  memo: string;
};

/** A settled prize position, per edition and per pot (league or global). */
export type PrizeAward = {
  id: string;
  editionId: string;
  leagueId: string | null;
  potCents: number;
  userId: string;
  teamName: string;
  place: number;
  label: string;
  amountCents: number;
  status: "awarded" | "paid";
  settledAt: string;
  paidAt: string | null;
};

/** One-time email sign-in link. Only the SHA-256 of the token is stored. */
type LoginToken = { hash: string; userId: string; expiresAt: string; used: boolean };

type Db = {
  users: User[];
  leagues: ServerLeague[];
  loginTokens: LoginToken[];
  orders: Order[];
  ledger: LedgerRow[];
  prizes: PrizeAward[];
  /** Provider event ids already applied, so a retried webhook is a no-op. */
  webhookEvents: string[];
  /** Operator corrections to match results and awards, if any. */
  results?: ResultsOverride;
  version: number;
};

const FILE = process.env.DB_FILE ?? path.join(process.cwd(), ".data", "twenty-eight.json");

async function readDb(): Promise<Db> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Db>;
    return {
      version: 4,
      users: parsed.users ?? [],
      leagues: parsed.leagues ?? [],
      loginTokens: parsed.loginTokens ?? [],
      orders: parsed.orders ?? [],
      ledger: parsed.ledger ?? [],
      prizes: parsed.prizes ?? [],
      webhookEvents: parsed.webhookEvents ?? [],
      results: parsed.results,
    };
  } catch {
    return {
      version: 4,
      users: [],
      leagues: [],
      loginTokens: [],
      orders: [],
      ledger: [],
      prizes: [],
      webhookEvents: [],
    };
  }
}

async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // Write to a temp file then rename, so a crash mid-write can't truncate the store.
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

/**
 * Every mutation is read-modify-write on one file. Without a queue, two requests
 * landing together both read the old file and the second write silently drops
 * the first (e.g. two people paying at once). Serialise them in-process.
 */
let queue: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (db: Db) => Promise<T> | T): Promise<T> {
  const run = queue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await readDb();
  const needle = email.trim().toLowerCase();
  return db.users.find((u) => u.email.toLowerCase() === needle) ?? null;
}

export async function findUser(id: string): Promise<User | null> {
  const db = await readDb();
  return db.users.find((u) => u.id === id) ?? null;
}

export async function upsertUser(input: {
  email: string;
  manager: string;
  teamName: string;
}): Promise<User> {
  return mutate((db) => {
    const existing = db.users.find(
      (u) => u.email.toLowerCase() === input.email.toLowerCase(),
    );
    if (existing) {
      existing.manager = input.manager || existing.manager;
      existing.teamName = input.teamName || existing.teamName;
      return existing;
    }
    const user: User = {
      id: crypto.randomUUID(),
      email: input.email,
      manager: input.manager,
      teamName: input.teamName,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return user;
  });
}

export async function saveEntry(
  userId: string,
  patch: Partial<Entry> & { plan: string },
): Promise<User | null> {
  return mutate((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return null;
    const ref =
      user.entry?.ref ??
      `TE-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}-ADRE`;
    user.entry = {
      ...user.entry,
      ref,
      plan: patch.plan,
      amount: patch.amount ?? user.entry?.amount ?? 0,
      paidAt: user.entry?.paidAt ?? new Date().toISOString(),
      editionId: patch.editionId ?? user.entry?.editionId ?? "adare-2027",
      // Recorded at checkout from the plan, so prize pools never have to infer
      // eligibility from the amount paid.
      prizeEligible: patch.prizeEligible ?? user.entry?.prizeEligible ?? (patch.amount ?? 0) > 0,
    };
    return user;
  });
}

export async function updateTeam(
  userId: string,
  team: {
    mode?: "classic" | "full";
    squad?: string[];
    captain?: string | null;
    predictions?: Record<string, string>;
    awards?: Entry["awards"];
    pinpoint?: Entry["pinpoint"];
  },
): Promise<User | null> {
  return mutate((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user?.entry) return null;
    user.entry = { ...user.entry, ...team, updatedAt: new Date().toISOString() };
    return user;
  });
}

/* ——— Results overrides ——— */

export async function readResultsOverride(): Promise<ResultsOverride | null> {
  const db = await readDb();
  return db.results ?? null;
}

export async function saveResultsOverride(patch: ResultsOverride | null): Promise<ResultsOverride | null> {
  return mutate((db) => {
    if (patch === null) {
      delete db.results;
      return null;
    }
    db.results = patch;
    return patch;
  });
}

/** Every account, for the global standings. */
export async function listUsers(): Promise<User[]> {
  const db = await readDb();
  return db.users;
}

/* ——— Private leagues ——— */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_LEAGUES_PER_USER = 20;
const MAX_LEAGUE_SIZE = 500;

function leagueCode(name: string, taken: Set<string>): string {
  const stem = (name.replace(/[^a-zA-Z]/g, "").toUpperCase() || "CUP").slice(0, 3).padEnd(3, "X");
  for (;;) {
    const bytes = randomBytes(3);
    let tail = "";
    for (const b of bytes) tail += CODE_ALPHABET[b % CODE_ALPHABET.length];
    const code = `${stem}${tail}`;
    if (!taken.has(code)) return code;
  }
}

/** One league with its members, without needing a viewer. */
export async function findLeague(id: string): Promise<{ league: ServerLeague; members: User[] } | null> {
  const db = await readDb();
  const league = db.leagues.find((row) => row.id === id);
  if (!league) return null;
  return { league, members: db.users.filter((user) => league.memberIds.includes(user.id)) };
}

/** Every league, for attributing a payment to the right pot. */
export async function listAllLeagues(): Promise<ServerLeague[]> {
  const db = await readDb();
  return db.leagues;
}

export async function listLeaguesFor(userId: string): Promise<{ league: ServerLeague; members: User[] }[]> {
  const db = await readDb();
  return db.leagues
    .filter((l) => l.memberIds.includes(userId))
    .map((league) => ({
      league,
      members: league.memberIds
        .map((id) => db.users.find((u) => u.id === id))
        .filter((u): u is User => Boolean(u)),
    }));
}

export async function createLeague(
  ownerId: string,
  name: string,
  buyIn: number,
): Promise<ServerLeague | { error: string }> {
  return mutate((db) => {
    const owned = db.leagues.filter((l) => l.ownerId === ownerId).length;
    if (owned >= MAX_LEAGUES_PER_USER) return { error: `You can run up to ${MAX_LEAGUES_PER_USER} leagues.` };
    const league: ServerLeague = {
      id: crypto.randomUUID(),
      name,
      code: leagueCode(name, new Set(db.leagues.map((l) => l.code))),
      ownerId,
      buyIn,
      memberIds: [ownerId],
      createdAt: new Date().toISOString(),
    };
    db.leagues.push(league);
    return league;
  });
}

export async function joinLeagueByCode(
  userId: string,
  code: string,
): Promise<ServerLeague | { error: string }> {
  return mutate((db) => {
    const league = db.leagues.find((l) => l.code === code.trim().toUpperCase());
    if (!league) return { error: "No league has that code." };
    if (league.memberIds.includes(userId)) return { error: `You're already in ${league.name}.` };
    if (league.memberIds.length >= MAX_LEAGUE_SIZE) return { error: "That league is full." };
    league.memberIds.push(userId);
    return league;
  });
}

export async function leaveLeague(userId: string, leagueId: string): Promise<boolean> {
  return mutate((db) => {
    const league = db.leagues.find((l) => l.id === leagueId);
    if (!league || !league.memberIds.includes(userId)) return false;
    league.memberIds = league.memberIds.filter((id) => id !== userId);
    // The commissioner leaving hands the league to the longest-standing member.
    if (league.ownerId === userId && league.memberIds.length > 0) league.ownerId = league.memberIds[0];
    if (league.memberIds.length === 0) db.leagues = db.leagues.filter((l) => l.id !== leagueId);
    return true;
  });
}

/* ——— Email sign-in links ——— */

const LINK_MINUTES = 15;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Creates a one-time sign-in token for an existing account (null if no account). */
export async function createLoginToken(email: string): Promise<{ token: string; user: User } | null> {
  return mutate((db) => {
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return null;
    const now = Date.now();
    // Drop expired/used tokens so the file doesn't grow forever.
    db.loginTokens = db.loginTokens.filter((t) => !t.used && Date.parse(t.expiresAt) > now);
    const token = randomBytes(24).toString("base64url");
    db.loginTokens.push({
      hash: sha256(token),
      userId: user.id,
      expiresAt: new Date(now + LINK_MINUTES * 60_000).toISOString(),
      used: false,
    });
    return { token, user };
  });
}

/** Spends a sign-in token; returns the user id if it was valid and unused. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  return mutate((db) => {
    const entry = db.loginTokens.find((t) => t.hash === sha256(token));
    if (!entry || entry.used || Date.parse(entry.expiresAt) <= Date.now()) return null;
    entry.used = true;
    return entry.userId;
  });
}


/* ——— Orders, ledger, prizes ——— */

/** A reference a person can read out loud: ORD-7F3A9C. */
export function newOrderRef(): string {
  return `ORD-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export async function createOrder(order: Order): Promise<Order> {
  return mutate((db) => {
    db.orders.push(order);
    return order;
  });
}

export async function findOrder(ref: string): Promise<Order | null> {
  const db = await readDb();
  return db.orders.find((order) => order.ref === ref) ?? null;
}

export async function findOrderByProviderRef(providerRef: string): Promise<Order | null> {
  const db = await readDb();
  return db.orders.find((order) => order.providerRef === providerRef) ?? null;
}

export async function listOrders(): Promise<Order[]> {
  const db = await readDb();
  return db.orders;
}

export async function attachProviderRef(ref: string, providerRef: string): Promise<Order | null> {
  return mutate((db) => {
    const order = db.orders.find((o) => o.ref === ref);
    if (!order) return null;
    order.providerRef = providerRef;
    return order;
  });
}

export async function listLedger(): Promise<LedgerRow[]> {
  const db = await readDb();
  return db.ledger;
}

/**
 * Mark an order paid and create the entry in the same write, so there is no
 * window where money has been taken and no entry exists. Idempotent: a repeat
 * call (Stripe retrying a webhook, a user double-clicking) returns the same order
 * and writes nothing.
 */
export async function settleOrder(
  ref: string,
  opts: { providerRef?: string | null; now?: string } = {},
): Promise<{ order: Order; user: User; alreadyPaid: boolean } | null> {
  return mutate((db) => {
    const order = db.orders.find((o) => o.ref === ref);
    if (!order) return null;
    const user = db.users.find((u) => u.id === order.userId);
    if (!user) return null;

    if (order.status === "paid" && user.entry) {
      return { order, user, alreadyPaid: true };
    }
    if (order.status === "refunded" || order.status === "failed") {
      return { order, user, alreadyPaid: false };
    }

    const at = opts.now ?? new Date().toISOString();
    order.status = "paid";
    order.paidAt = at;
    if (opts.providerRef) order.providerRef = opts.providerRef;

    const ref_ = user.entry?.ref ?? `TE-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}-ADRE`;
    user.entry = {
      ...user.entry,
      ref: ref_,
      plan: order.planId,
      amount: order.amountCents / 100,
      paidAt: user.entry?.paidAt ?? at,
      editionId: order.editionId,
      prizeEligible: order.prizeEligible,
    };

    const split = allocate(order.amountCents);
    const memo = `${order.planName} · ${order.ref}`;
    db.ledger.push(
      {
        id: crypto.randomUUID(),
        at,
        kind: "entry_fee",
        amountCents: split.cents,
        editionId: order.editionId,
        orderRef: order.ref,
        userId: order.userId,
        memo,
      },
      {
        id: crypto.randomUUID(),
        at,
        kind: "platform_fee",
        amountCents: split.platformCents,
        editionId: order.editionId,
        orderRef: order.ref,
        userId: order.userId,
        memo: "Platform & card fees (5%)",
      },
      {
        id: crypto.randomUUID(),
        at,
        kind: "prize_pool",
        amountCents: split.poolCents,
        editionId: order.editionId,
        orderRef: order.ref,
        userId: order.userId,
        memo: "Allocated to the prize pool",
      },
    );

    return { order, user, alreadyPaid: false };
  });
}

/** Mark a pending order failed (abandoned checkout, declined card). */
export async function failOrder(ref: string, note: string): Promise<Order | null> {
  return mutate((db) => {
    const order = db.orders.find((o) => o.ref === ref);
    if (!order || order.status !== "pending") return order ?? null;
    order.status = "failed";
    order.note = note;
    return order;
  });
}

/**
 * Reverse a paid order: the entry stops being prize-eligible and the ledger gets
 * counter-rows, so the pool shrinks by exactly what it grew by.
 */
export async function refundOrder(
  ref: string,
  opts: { now?: string; note?: string } = {},
): Promise<{ order: Order; user: User } | null> {
  return mutate((db) => {
    const order = db.orders.find((o) => o.ref === ref);
    if (!order) return null;
    if (order.status === "refunded") {
      const user = db.users.find((u) => u.id === order.userId);
      return user ? { order, user } : null;
    }
    if (order.status !== "paid") return null;

    const user = db.users.find((u) => u.id === order.userId);
    if (!user) return null;

    const at = opts.now ?? new Date().toISOString();
    order.status = "refunded";
    order.refundedAt = at;
    if (opts.note) order.note = opts.note;
    if (user.entry) user.entry = { ...user.entry, prizeEligible: false };

    const split = allocate(order.amountCents);
    db.ledger.push(
      {
        id: crypto.randomUUID(),
        at,
        kind: "refund",
        amountCents: -split.cents,
        editionId: order.editionId,
        orderRef: order.ref,
        userId: order.userId,
        memo: `Refunded ${order.ref}`,
      },
      {
        id: crypto.randomUUID(),
        at,
        kind: "platform_fee",
        amountCents: -split.platformCents,
        editionId: order.editionId,
        orderRef: order.ref,
        userId: order.userId,
        memo: `Reversed fees · ${order.ref}`,
      },
      {
        id: crypto.randomUUID(),
        at,
        kind: "prize_pool",
        amountCents: -split.poolCents,
        editionId: order.editionId,
        orderRef: order.ref,
        userId: order.userId,
        memo: `Removed from the pool · ${order.ref}`,
      },
    );
    return { order, user };
  });
}

export async function listPrizes(): Promise<PrizeAward[]> {
  const db = await readDb();
  return db.prizes;
}

/** Replace the awards for one pot. Idempotent because the caller recomputes them. */
export async function savePrizeAwards(
  pot: { editionId: string; leagueId: string | null },
  awards: PrizeAward[],
): Promise<PrizeAward[]> {
  return mutate((db) => {
    db.prizes = db.prizes.filter(
      (row) => !(row.editionId === pot.editionId && row.leagueId === pot.leagueId),
    );
    db.prizes.push(...awards);
    return awards;
  });
}

export async function markPrizesPaid(
  pot: { editionId: string; leagueId: string | null },
  now = new Date().toISOString(),
): Promise<PrizeAward[]> {
  return mutate((db) => {
    const rows = db.prizes.filter(
      (row) => row.editionId === pot.editionId && row.leagueId === pot.leagueId,
    );
    for (const row of rows) {
      if (row.status === "paid") continue;
      row.status = "paid";
      row.paidAt = now;
      db.ledger.push({
        id: crypto.randomUUID(),
        at: now,
        kind: "prize_payout",
        amountCents: -row.amountCents,
        editionId: row.editionId,
        orderRef: null,
        userId: row.userId,
        memo: `${row.label} · ${row.teamName}`,
      });
    }
    return rows;
  });
}

export async function hasWebhookEvent(id: string): Promise<boolean> {
  const db = await readDb();
  return db.webhookEvents.includes(id);
}

export async function recordWebhookEvent(id: string): Promise<void> {
  await mutate((db) => {
    if (!db.webhookEvents.includes(id)) db.webhookEvents.push(id);
    if (db.webhookEvents.length > 500) db.webhookEvents = db.webhookEvents.slice(-500);
  });
}
