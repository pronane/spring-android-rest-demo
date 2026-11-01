/**
 * The store contract: everything `lib/server/db.ts` promises, run against a real
 * database.
 *
 *   npm run db:check           # Postgres, on a throwaway cluster
 *   npm run db:check:sqlite    # SQLite, in a throwaway file
 *
 * Both call `runStoreContract()` with a small `probe` that reads the tables
 * directly, so the assertions are written once. A column the adapter forgets to
 * write, a jsonb/TEXT mismatch, a boolean that comes back as 0, a bigint that
 * comes back as a string — all of it fails here rather than in production.
 */
import type { Order } from "../lib/server/db";

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

export type StoreProbe = {
  /** "Postgres" or "SQLite", for the log. */
  label: string;
  /** What `db.backend()` must return. */
  backend: "postgres" | "sqlite" | "turso";
  tableNames: () => Promise<string[]>;
  counts: () => Promise<{
    users: number;
    leagues: number;
    orders: number;
    ledger: number;
    prizes: number;
    tokens: number;
    events: number;
    results: number;
  }>;
  userColumns: () => Promise<string[]>;
  /** The backend's own health probe, as `/api/health` uses it. */
  ping: () => Promise<{ ok: boolean; detail: string }>;
  identityProvider: (userId: string) => Promise<string | null>;
};

export async function runStoreContract(probe: StoreProbe): Promise<{ checks: number; failures: number }> {
  const db = await import("../lib/server/db");

  check(`${probe.label}: the URL selects this backend`, db.backend(), probe.backend);
  const health = await probe.ping();
  ok(`${probe.label}: the app's own health probe sees the schema`, health.ok, health.detail);

  const tables = await probe.tableNames();
  check(`${probe.label}: the schema creates the eight store tables`, tables.length, 8);
  check(
    `${probe.label}: and they are the ones the app expects`,
    tables.join(","),
    "leagues,ledger,login_tokens,orders,prizes,results,users,webhook_events",
  );

  /* ——— a player and an identity ——— */
  const user = await db.upsertUser({ email: "Check@Example.com", manager: "Check Runner", teamName: "Contract FC" });
  check(`${probe.label}: a new account reads back by email`, (await db.findUserByEmail("check@example.com"))?.id, user.id);
  await db.linkIdentity(user.id, { provider: "google", subject: "g-1", email: "check@example.com" });
  check(`${probe.label}: an identity is found by provider + subject`, (await db.findUserByIdentity("google", "g-1"))?.id, user.id);

  /* ——— money: an order, its entry and three ledger rows ——— */
  const order: Order = {
    ref: db.newOrderRef(),
    userId: user.id,
    email: "check@example.com",
    planId: "single",
    planName: "Single entry",
    amountCents: 1000,
    currency: "EUR",
    editionId: "adare-2027",
    prizeEligible: true,
    status: "pending",
    provider: "demo",
    providerRef: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
    refundedAt: null,
  };
  await db.createOrder(order);
  const settled = await db.settleOrder(order.ref);
  ok(`${probe.label}: settling an order creates the entry`, Boolean(settled?.user.entry?.ref));
  const entryRef = settled?.user.entry?.ref ?? "";
  check(`${probe.label}: the entry is found by its public ref`, (await db.findUserByEntryRef(entryRef))?.id, user.id);

  const ledger = await db.listLedger();
  check(`${probe.label}: a payment writes its three rows`, ledger.length, 3);
  const byKind = Object.fromEntries(ledger.map((row) => [row.kind, row.amountCents]));
  check(
    `${probe.label}: split into the price, the platform's 5% and the pool`,
    [byKind.entry_fee, byKind.platform_fee, byKind.prize_pool],
    [1000, 50, 950],
  );
  check(`${probe.label}: cents survive as numbers`, typeof ledger[0]?.amountCents, "number");

  // A card on the entry, written through the same JSON column.
  await db.updateTeam(user.id, {
    mode: "classic",
    squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka"],
    captain: "rory",
    sessionCaptains: { fri: "rory", sat: "nobody-on-the-card" },
  });
  const card = await db.readCard(user.id);
  check(`${probe.label}: a saved card survives the round trip`, [card?.mode, card?.squad?.length, card?.captain], ["classic", 6, "rory"]);
  check(`${probe.label}: and the armband drops a player who is not on the card`, card?.sessionCaptains?.sat, null);

  const repeat = await db.settleOrder(order.ref);
  check(`${probe.label}: settling twice is a no-op`, [repeat?.alreadyPaid, (await db.listLedger()).length], [true, 3]);

  /* ——— a league ——— */
  const league = await db.createLeague(user.id, "The Check League", 5);
  ok(`${probe.label}: a league can be created`, "code" in league);
  const code = "code" in league ? league.code : "";
  const friend = await db.upsertUser({ email: "friend@example.com", manager: "Friend", teamName: "Second Card" });
  const joined = await db.joinLeagueByCode(friend.id, code);
  ok(`${probe.label}: and joined by another account using the code`, "code" in joined);
  check(`${probe.label}: and lists both members`, (await db.listLeaguesFor(user.id))[0]?.members.length, 2);
  const refused = await db.joinLeagueByCode(friend.id, "NOPE");
  ok(`${probe.label}: a wrong code is refused`, "error" in refused);

  /* ——— a sign-in token, a webhook id ——— */
  const token = await db.createLoginToken("check@example.com");
  ok(`${probe.label}: a one-time token is issued`, Boolean(token?.token));
  check(
    `${probe.label}: and spends exactly once`,
    [await db.consumeLoginToken(token?.token ?? ""), await db.consumeLoginToken(token?.token ?? "")],
    [user.id, null],
  );
  check(
    `${probe.label}: a webhook id is remembered`,
    [await db.recordWebhookEvent("evt_1"), await db.hasWebhookEvent("evt_1")],
    [undefined, true],
  );

  /* ——— prizes and an operator correction ——— */
  const leagueId = "code" in league ? league.id : null;
  const awards = await db.savePrizeAwards({ editionId: "adare-2027", leagueId }, [
    {
      id: "award-1",
      editionId: "adare-2027",
      leagueId,
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
  ]);
  check(`${probe.label}: an award is stored`, awards.length, 1);
  const paid = await db.markPrizesPaid({ editionId: "adare-2027", leagueId });
  check(
    `${probe.label}: marking it paid adds the payout row`,
    [paid[0]?.status, (await db.listLedger()).length],
    ["paid", 4],
  );

  await db.saveResultsOverride({ matches: { "fri-am-1": { result: "europe" } }, updatedAt: new Date().toISOString() });
  const override = await db.readResultsOverride();
  check(`${probe.label}: an operator correction round-trips`, override?.matches?.["fri-am-1"]?.result, "europe");

  /* ——— the tables themselves ——— */
  const row = await probe.counts();
  check(
    `${probe.label}: every collection reached its table`,
    [row.users, row.leagues, row.orders, row.ledger, row.prizes, row.tokens, row.events, row.results],
    [2, 1, 1, 4, 1, 1, 1, 1],
  );

  check(
    `${probe.label}: the users table has real columns, not one blob`,
    (await probe.userColumns()).join(","),
    "id,email,manager,team_name,created_at,entry,identities",
  );
  check(`${probe.label}: an identity is stored as JSON on the row`, await probe.identityProvider(user.id), "google");

  return { checks, failures };
}

export function summarise(label: string, result: { checks: number; failures: number }): void {
  console.log(`\n${result.checks - result.failures}/${result.checks} ${label} checks pass`);
  if (result.failures > 0) process.exitCode = 1;
}

export function fail(error: unknown): void {
  console.error("\n" + (error instanceof Error ? error.stack ?? error.message : String(error)));
  process.exitCode = 1;
}
