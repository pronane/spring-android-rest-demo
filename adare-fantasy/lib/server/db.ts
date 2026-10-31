/**
 * Tiny JSON-file store so the demo has a real backend (accounts, paid entries,
 * saved cards) without needing Postgres. Swap the four functions below for
 * Prisma/Postgres in production — nothing else in the app touches storage.
 *
 * Note: serverless filesystems are ephemeral; deploy the v1 API against a
 * managed database. See README → "Roadmap to v1".
 */
import { promises as fs } from "node:fs";
import path from "node:path";

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
  updatedAt?: string;
};

type Db = { users: User[]; version: number };

const FILE = process.env.DB_FILE ?? path.join(process.cwd(), ".data", "twenty-eight.json");

async function readDb(): Promise<Db> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Db;
    return { version: 2, users: parsed.users ?? [] };
  } catch {
    return { version: 2, users: [] };
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
  },
): Promise<User | null> {
  return mutate((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user?.entry) return null;
    user.entry = { ...user.entry, ...team, updatedAt: new Date().toISOString() };
    return user;
  });
}
