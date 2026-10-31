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
  await fs.writeFile(FILE, JSON.stringify(db, null, 2), "utf8");
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
  const db = await readDb();
  const existing = db.users.find(
    (u) => u.email.toLowerCase() === input.email.toLowerCase(),
  );
  if (existing) {
    existing.manager = input.manager || existing.manager;
    existing.teamName = input.teamName || existing.teamName;
    await writeDb(db);
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
  await writeDb(db);
  return user;
}

export async function saveEntry(
  userId: string,
  patch: Partial<Entry> & { plan: string },
): Promise<User | null> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const ref =
    user.entry?.ref ??
    `TE-${Math.random().toString(16).slice(2, 6).toUpperCase()}-ADRE`;
  user.entry = {
    ...user.entry,
    ref,
    plan: patch.plan,
    amount: patch.amount ?? user.entry?.amount ?? 0,
    paidAt: user.entry?.paidAt ?? new Date().toISOString(),
    editionId: patch.editionId ?? user.entry?.editionId ?? "adare-2027",
  };
  await writeDb(db);
  return user;
}

export async function updateTeam(
  userId: string,
  team: {
    mode?: "classic" | "full";
    squad?: string[];
    captain?: string | null;
    predictions?: Record<string, string>;
  },
): Promise<User | null> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user?.entry) return null;
  user.entry = { ...user.entry, ...team };
  await writeDb(db);
  return user;
}
