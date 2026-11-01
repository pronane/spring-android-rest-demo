/**
 * Fills a deployment with demo players, so a public link is not an empty table.
 *
 *   npm run seed                    add the demo entries (skips any that exist)
 *   npm run seed -- --reset --force empty the demo accounts first, then add them
 *
 * It plays fair: every seeded manager is a normal account with a paid order, an
 * entry, a legal card and all 28 predictions, created through the same
 * `lib/server/db.ts` functions the API uses. Nothing is written into the store
 * that a real player could not have written.
 *
 * The accounts live on `@demo.twenty-eight.golf`, so `--reset` clears them (and
 * their orders, ledger rows, prizes and leagues) without touching real sign-ups.
 */
import fs from "node:fs";
import path from "node:path";

import { PLAYER_BY_ID, PLAYERS } from "../lib/data";
import { matchesFor, type Pick } from "../lib/sim";
import { modeConfig, spendOf, validateSquad } from "../lib/helpers";
import {
  backend,
  createLeague,
  createOrder,
  joinLeagueByCode,
  listAllLeagues,
  settleOrder,
  updateTeam,
  upsertUser,
} from "../lib/server/db";

const DOMAIN = "demo.twenty-eight.golf";
const LEAGUE_NAME = "The Adare Invitational";
const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const FORCE = args.has("--force");
const say = (message: string) => console.log(message);

type Seed = { manager: string; teamName: string; squad: string[]; note: string };

/** Seven legal Classic Six cards — each one fits 100m with four a side. */
const ENTRIES: Seed[] = [
  { manager: "Aoife Byrne", teamName: "Adare Abú", squad: ["rory", "macintyre", "lowry", "straka", "scheffler", "morikawa"], note: "the home picks" },
  { manager: "Darragh O'Sullivan", teamName: "Bogey Merchants", squad: ["aberg", "hovland", "fleetwood", "rasmus", "schauffele", "henley"], note: "form over flags" },
  { manager: "Niamh Kelly", teamName: "Limerick Lilies", squad: ["rahm", "hatton", "rose", "young", "thomas", "griffin"], note: "Ryder Cup veterans" },
  { manager: "Ciarán Walsh", teamName: "The 19th Hole", squad: ["rory", "rahm", "lowry", "cantlay", "dechambeau", "spaun"], note: "wildcards and all" },
  { manager: "Sinéad Murphy", teamName: "Sunday Singles", squad: ["hovland", "macintyre", "fitzpatrick", "dechambeau", "mcnealy", "henley"], note: "sunday specialists" },
  { manager: "Tomás Ryan", teamName: "Captain's Picks", squad: ["rory", "aberg", "lowry", "rahm", "thomas", "young"], note: "four Europeans, two Yanks" },
  { manager: "Lucy Hale", teamName: "Wentworth Wanderers", squad: ["fleetwood", "rose", "hatton", "straka", "scheffler", "morikawa"], note: "the European Tour core" },
];

/* ——— a legal card, if one of the hand-picked ones ever stops being legal ——— */

function fallbackSquad(seedIndex: number): string[] {
  const { squadSize, budget } = modeConfig("classic");
  let state = 2_027 + seedIndex * 977;
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  const order = [...PLAYERS]
    .map((player) => ({ id: player.id, key: next() }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.id);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const squad: string[] = [];
    for (const id of order) {
      if (squad.length === squadSize) break;
      const candidate = [...squad, id];
      const errors = validateSquad(candidate, "classic");
      // Only "you have not picked them all yet" is acceptable while building.
      if (errors.every((error) => error.startsWith("Pick ")) && spendOf(candidate) <= budget) squad.push(id);
    }
    if (validateSquad(squad, "classic").length === 0) return squad;
    order.push(order.shift() as string);
  }
  throw new Error("Could not build a legal card for the seed data.");
}

function predictions(seedIndex: number): Record<string, Pick> {
  const out: Record<string, Pick> = {};
  matchesFor().forEach((match, index) => {
    const hash = (index * 31 + seedIndex * 17) % 100;
    out[match.id] = hash < 45 ? "europe" : hash < 88 ? "usa" : "half";
  });
  return out;
}

/* ——— removing the demo accounts, and only those ——— */

async function resetSeeded() {
  const like = `%@${DOMAIN}`;

  if (backend() === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query("select count(*)::int as n from users where email like $1", [like]);
      say(`Removing ${rows[0].n} seeded account(s) from Postgres…`);
      await client.query("begin");
      await client.query("delete from login_tokens where user_id in (select id from users where email like $1)", [like]);
      await client.query("delete from prizes where user_id in (select id from users where email like $1)", [like]);
      await client.query("delete from ledger where user_id in (select id from users where email like $1)", [like]);
      await client.query("delete from orders where user_id in (select id from users where email like $1)", [like]);
      await client.query("delete from leagues where owner_id in (select id from users where email like $1)", [like]);
      await client.query("delete from users where email like $1", [like]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
    return;
  }

  const file = path.resolve(process.cwd(), process.env.DB_FILE ?? ".data/twenty-eight.json");
  if (!fs.existsSync(file)) return;
  const db = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown[]>;
  const users = (db.users ?? []) as { id: string; email: string }[];
  const gone = new Set(users.filter((user) => user.email.endsWith(`@${DOMAIN}`)).map((user) => user.id));
  if (gone.size === 0) return;
  say(`Removing ${gone.size} seeded account(s) from ${path.relative(process.cwd(), file)}…`);
  db.users = (db.users ?? []).filter((user) => !gone.has((user as { id: string }).id));
  db.orders = (db.orders ?? []).filter((row) => !gone.has((row as { userId: string }).userId));
  db.ledger = (db.ledger ?? []).filter((row) => !gone.has((row as { userId: string }).userId));
  db.prizes = (db.prizes ?? []).filter((row) => !gone.has((row as { userId: string }).userId));
  db.loginTokens = (db.loginTokens ?? []).filter((row) => !gone.has((row as { userId: string }).userId));
  db.leagues = (db.leagues ?? []).filter((row) => !gone.has((row as { ownerId: string }).ownerId));
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}

/* ——— main ——— */

async function main() {
  if (RESET && !FORCE) {
    console.error(
      "--reset removes the seeded demo accounts and their money. Add --force if that is what you want:\n" +
        "  npm run seed -- --reset --force",
    );
    process.exit(2);
  }
  if (RESET) await resetSeeded();

  say(`Seeding ${ENTRIES.length} demo entries into the ${backend()} store…\n`);

  const owners: { userId: string; teamName: string }[] = [];
  let created = 0;

  for (const [index, entry] of ENTRIES.entries()) {
    const email = `manager${index + 1}@${DOMAIN}`;
    const squad = entry.squad.every((id) => PLAYER_BY_ID[id]) && validateSquad(entry.squad, "classic").length === 0
      ? entry.squad
      : fallbackSquad(index);

    const user = await upsertUser({ email, manager: entry.manager, teamName: entry.teamName });
    const already = await settleOrder(`ORD-SEED${String(index + 1).padStart(2, "0")}`);
    if (already) {
      say(`·  ${entry.teamName} already exists — skipping`);
      owners.push({ userId: user.id, teamName: entry.teamName });
      continue;
    }

    const order = {
      ref: `ORD-SEED${String(index + 1).padStart(2, "0")}`,
      userId: user.id,
      email,
      planId: "single",
      planName: "Single entry",
      amountCents: 1000,
      currency: "EUR",
      editionId: "adare-2027",
      prizeEligible: true,
      status: "pending" as const,
      provider: "demo" as const,
      providerRef: null,
      createdAt: new Date(Date.now() - (ENTRIES.length - index) * 60_000).toISOString(),
      paidAt: null,
      refundedAt: null,
      note: `Seeded demo entry — ${entry.note}`,
    };
    await createOrder(order);
    await settleOrder(order.ref);
    await updateTeam(user.id, {
      mode: "classic",
      squad,
      captain: squad[0],
      predictions: predictions(index),
      awards: { mvp: squad[0], topScorer: squad[1], rookie: squad[squad.length - 1] },
    });

    owners.push({ userId: user.id, teamName: entry.teamName });
    created += 1;
    say(`·  ${entry.teamName} — ${entry.manager}, €10 paid (${entry.note})`);
  }

  if (owners.length > 1) {
    // Re-running the seed must not leave a second league of the same name behind:
    // reuse the one a previous run made, and top up its membership.
    const existing = (await listAllLeagues()).find((league) => league.name === LEAGUE_NAME);
    if (existing) {
      for (const owner of owners.slice(1)) await joinLeagueByCode(owner.userId, existing.code);
      say(`\nLeague: ${LEAGUE_NAME} already exists — join code ${existing.code}`);
    } else {
      const league = await createLeague(owners[0].userId, LEAGUE_NAME, 5);
      if ("code" in league) {
        for (const owner of owners.slice(1)) await joinLeagueByCode(owner.userId, league.code);
        say(`\nLeague: ${LEAGUE_NAME} — join code ${league.code}`);
      } else {
        say(`\nLeague: could not create ${LEAGUE_NAME} — ${league.error}`);
      }
    }
  }

  say(`\n${created} entr${created === 1 ? "y" : "ies"} created, ${owners.length} in the demo table.`);
  say("Sign in as any of them from /account with their email — the one-time link lands in MAIL_OUTBOX.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
