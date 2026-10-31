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

/** One-time email sign-in link. Only the SHA-256 of the token is stored. */
type LoginToken = { hash: string; userId: string; expiresAt: string; used: boolean };

type Db = {
  users: User[];
  leagues: ServerLeague[];
  loginTokens: LoginToken[];
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
      version: 3,
      users: parsed.users ?? [],
      leagues: parsed.leagues ?? [],
      loginTokens: parsed.loginTokens ?? [],
      results: parsed.results,
    };
  } catch {
    return { version: 3, users: [], leagues: [], loginTokens: [] };
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

