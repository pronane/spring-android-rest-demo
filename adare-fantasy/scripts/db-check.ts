/**
 * The Postgres backend, end to end, on a throwaway cluster.
 *
 *   npm run db:check
 *
 * It starts a real Postgres from the bundled binaries (no admin, no server of
 * your own), applies `db/schema.sql`, points the app at it and then drives the
 * exported functions in `lib/server/db.ts` exactly as the API routes do — a
 * player, a paid order and its three ledger rows, a league, a sign-in token, a
 * webhook id, a prize settlement and an operator correction. Finally it reads
 * the tables directly, so a column the adapter forgets to write fails here
 * rather than in production.
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = ".data/pg-check";
const PORT = Number(process.env.PG_CHECK_PORT ?? 54339);
const CREDENTIALS = ".data/pg-check-credentials.json";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}

function ok(name: string, passed: boolean, detail = "") {
  checks += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${passed ? "" : `\n      ${detail}`}`);
}

const node = process.execPath;
const localDb = (...args: string[]) =>
  execFileSync(node, [path.join(ROOT, "scripts", "local-db.mjs"), ...args], {
    cwd: ROOT,
    env: { ...process.env, PGDATA_DIR: DATA_DIR, PGPORT: String(PORT), PGCREDENTIALS_FILE: CREDENTIALS },
    encoding: "utf8",
  });

async function main() {
  // A cluster of our own, so this can run beside a real one.
  console.log(`starting a throwaway Postgres in ${DATA_DIR} on port ${PORT}…\n`);
  await fs.rm(path.join(ROOT, DATA_DIR), { recursive: true, force: true });
  await fs.rm(path.join(ROOT, CREDENTIALS), { force: true });
  localDb("start");

  const creds = JSON.parse(await fs.readFile(path.join(ROOT, CREDENTIALS), "utf8"));
  const url = `postgresql://${creds.user}:${encodeURIComponent(creds.password)}@127.0.0.1:${creds.port}/${creds.database}`;
  process.env.DATABASE_URL = url;

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();

  // Schema, exactly as the installer applies it.
  await client.query(await fs.readFile(path.join(ROOT, "db", "schema.sql"), "utf8"));
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  const names = tables.rows.map((row) => row.table_name);
  check("db/schema.sql creates the eight store tables", names.length, 8);
  check(
    "and they are the ones the app expects",
    names.join(","),
    "leagues,ledger,login_tokens,orders,prizes,results,users,webhook_events",
  );

  const db = await import("../lib/server/db");
  const { ping } = await import("../lib/server/store-pg");
  check("DATABASE_URL selects the Postgres backend", db.backend(), "postgres");
  ok("and the pool can see the schema", (await ping()).ok);

  /* ——— a player and an identity ——— */
  const user = await db.upsertUser({ email: "Check@Example.com", manager: "Check Runner", teamName: "Contract FC" });
  check("a new account reads back by email", (await db.findUserByEmail("check@example.com"))?.id, user.id);
  await db.linkIdentity(user.id, { provider: "google", subject: "g-1", email: "check@example.com" });
  check("an identity is found by provider + subject", (await db.findUserByIdentity("google", "g-1"))?.id, user.id);

  /* ——— money: an order, its entry and three ledger rows ——— */
  const order = {
    ref: db.newOrderRef(),
    userId: user.id,
    email: "check@example.com",
    planId: "single",
    planName: "Single entry",
    amountCents: 1000,
    currency: "EUR",
    editionId: "adare-2027",
    prizeEligible: true,
    status: "pending" as const,
    provider: "demo" as const,
    providerRef: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
    refundedAt: null,
  };
  await db.createOrder(order);
  const settled = await db.settleOrder(order.ref);
  ok("settling an order creates the entry", Boolean(settled?.user.entry?.ref));
  const entryRef = settled?.user.entry?.ref ?? "";
  check("the entry is found by its public ref", (await db.findUserByEntryRef(entryRef))?.id, user.id);

  const ledger = await db.listLedger();
  check("a payment writes its three rows", ledger.length, 3);
  const byKind = Object.fromEntries(ledger.map((row) => [row.kind, row.amountCents]));
  check(
    "split into the price, the platform's 5% and the pool",
    [byKind.entry_fee, byKind.platform_fee, byKind.prize_pool],
    [1000, 50, 950],
  );
  check("bigint cents survive as numbers", typeof ledger[0]?.amountCents, "number");

  // A card on the entry, written through the same jsonb column.
  await db.updateTeam(user.id, {
    mode: "classic",
    squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka"],
    captain: "rory",
    sessionCaptains: { fri: "rory", sat: "nobody-on-the-card" },
  });
  const card = await db.readCard(user.id);
  check("a saved card survives the round trip", [card?.mode, card?.squad?.length, card?.captain], ["classic", 6, "rory"]);
  check("and the armband drops a player who is not on the card", card?.sessionCaptains?.sat, null);

  const repeat = await db.settleOrder(order.ref);
  check("settling twice is a no-op", [repeat?.alreadyPaid, (await db.listLedger()).length], [true, 3]);

  /* ——— a league ——— */
  const league = await db.createLeague(user.id, "The Check League", 5);
  ok("a league can be created", "code" in league);
  const code = "code" in league ? league.code : "";
  const friend = await db.upsertUser({ email: "friend@example.com", manager: "Friend", teamName: "Second Card" });
  const joined = await db.joinLeagueByCode(friend.id, code);
  ok("and joined by another account using the code", "code" in joined);
  check("and lists both members", (await db.listLeaguesFor(user.id))[0]?.members.length, 2);
  const refused = await db.joinLeagueByCode(friend.id, "NOPE");
  ok("a wrong code is refused", "error" in refused);

  /* ——— a sign-in token, a webhook id ——— */
  const token = await db.createLoginToken("check@example.com");
  ok("a one-time token is issued", Boolean(token?.token));
  check("and spends exactly once", [await db.consumeLoginToken(token?.token ?? ""), await db.consumeLoginToken(token?.token ?? "")], [user.id, null]);
  check("a webhook id is remembered", [await db.recordWebhookEvent("evt_1"), await db.hasWebhookEvent("evt_1")], [undefined, true]);

  /* ——— prizes and an operator correction ——— */
  const awards = await db.savePrizeAwards(
    { editionId: "adare-2027", leagueId: "code" in league ? league.id : null },
    [
      {
        id: "award-1",
        editionId: "adare-2027",
        leagueId: "code" in league ? league.id : null,
        potCents: 500,
        userId: user.id,
        teamName: "Contract FC",
        place: 1,
        label: "1st overall",
        amountCents: 300,
        status: "awarded",
        settledAt: new Date().toISOString(),
        paidAt: null,
      },
    ],
  );
  check("an award is stored", awards.length, 1);
  const paid = await db.markPrizesPaid({ editionId: "adare-2027", leagueId: "code" in league ? league.id : null });
  check("marking it paid adds the payout row", [paid[0]?.status, (await db.listLedger()).length], ["paid", 4]);

  await db.saveResultsOverride({ matches: { "fri-am-1": { result: "europe" } }, updatedAt: new Date().toISOString() });
  const override = await db.readResultsOverride();
  check("an operator correction round-trips", override?.matches?.["fri-am-1"]?.result, "europe");

  /* ——— the tables themselves ——— */
  const counts = await client.query(`
    select (select count(*) from users)::int as users,
           (select count(*) from leagues)::int as leagues,
           (select count(*) from orders)::int as orders,
           (select count(*) from ledger)::int as ledger,
           (select count(*) from prizes)::int as prizes,
           (select count(*) from login_tokens)::int as tokens,
           (select count(*) from webhook_events)::int as events,
           (select count(*) from results)::int as results
  `);
  const row = counts.rows[0];
  check(
    "every collection reached its table",
    [row.users, row.leagues, row.orders, row.ledger, row.prizes, row.tokens, row.events, row.results],
    [2, 1, 1, 4, 1, 1, 1, 1],
  );

  const columns = await client.query(
    "select column_name from information_schema.columns where table_name = 'users' order by ordinal_position",
  );
  check(
    "the users table has real columns, not one blob",
    columns.rows.map((r) => r.column_name).join(","),
    "id,email,manager,team_name,created_at,entry,identities",
  );
  const identity = await client.query("select identities->0->>'provider' as provider from users where id = $1", [user.id]);
  check("an identity is stored as jsonb on the row", identity.rows[0]?.provider, "google");

  await client.end();
  // The app's pool is still open; close it before the server goes away, or the
  // connection errors land on the process rather than in a log.
  const { closePool } = await import("../lib/server/store-pg");
  await closePool();
  localDb("stop");
  await fs.rm(path.join(ROOT, DATA_DIR), { recursive: true, force: true });
  await fs.rm(path.join(ROOT, CREDENTIALS), { force: true });

  console.log(`\n${checks - failures}/${checks} Postgres checks pass`);
  if (failures > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("\n" + (error instanceof Error ? error.message : error));
  try {
    localDb("stop");
  } catch {
    /* the cluster may never have started */
  }
  process.exitCode = 1;
});
