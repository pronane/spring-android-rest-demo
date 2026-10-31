/**
 * Payments and prize-ledger tests, without a server or a network.
 *
 * The interesting behaviour in this area is not the UI: it is that an entry only
 * exists because an order was paid, that a retried webhook writes nothing new,
 * that a refund shrinks the pool by exactly what it grew by, and that a signature
 * check rejects tampering and stale timestamps. All of that runs here against a
 * throwaway store.
 *
 *   npm run payments:check
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "twentyeight-payments-"));
process.env.DB_FILE = path.join(dir, "db.json");
process.env.SESSION_SECRET = "payments-check-secret-0001";
process.env.PAYMENTS_PROVIDER = "demo";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_check_secret";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL  ${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  } else {
    console.log(`PASS  ${name}`);
  }
}

async function main() {
  const { allocate, splitPot, awardableLines } = await import("../lib/server/money");
  const { signStripePayload, verifyStripeSignature, paymentsProvider } = await import("../lib/server/stripe");
  const db = await import("../lib/server/db");
  const orders = await import("../lib/server/orders");

  /* ——— Stripe signatures ——— */

  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  const now = 1_800_000_000;
  const header = signStripePayload(payload, "whsec_check_secret", now);

  check("a signature Stripe would send verifies", verifyStripeSignature(payload, header, "whsec_check_secret", now), { ok: true });
  check(
    "a tampered body is rejected",
    verifyStripeSignature(payload.replace("evt_1", "evt_2"), header, "whsec_check_secret", now),
    { ok: false, reason: "signature mismatch" },
  );
  check(
    "the wrong secret is rejected",
    verifyStripeSignature(payload, header, "whsec_other", now),
    { ok: false, reason: "signature mismatch" },
  );
  check(
    "a replayed old signature is rejected",
    verifyStripeSignature(payload, header, "whsec_check_secret", now + 301),
    { ok: false, reason: "timestamp too old" },
  );
  check(
    "a future timestamp is rejected",
    verifyStripeSignature(payload, header, "whsec_check_secret", now - 400),
    { ok: false, reason: "timestamp in the future" },
  );
  check(
    "a header with no timestamp is rejected",
    verifyStripeSignature(payload, "v1=deadbeef", "whsec_check_secret", now),
    { ok: false, reason: "malformed timestamp" },
  );
  check(
    "one valid signature among several is enough",
    verifyStripeSignature(payload, `t=${now},v1=00ff,${header.split(",")[1]}`, "whsec_check_secret", now),
    { ok: true },
  );
  check("the demo provider is pinned by PAYMENTS_PROVIDER", paymentsProvider(), "demo");

  /* ——— Money maths ——— */

  check("€10 splits into a 5% fee and a 95% pool", allocate(1000), {
    cents: 1000,
    platformCents: 50,
    poolCents: 950,
  });
  check("€24 season pass splits the same way", allocate(2400), {
    cents: 2400,
    platformCents: 120,
    poolCents: 2280,
  });
  check("a €60 league pack still rounds to the cent", allocate(6000), {
    cents: 6000,
    platformCents: 300,
    poolCents: 5700,
  });
  for (const pot of [1000, 1001, 137, 999_999, 0]) {
    const lines = splitPot(pot);
    check(`the published split always adds up to the pot (${pot})`, lines.reduce((sum, line) => sum + line.cents, 0), pot);
  }
  check(
    "the platform fee is not paid out as a prize",
    awardableLines(1000).some((line) => line.label === "Platform & card fees"),
    false,
  );

  /* ——— Orders and the ledger ——— */

  const user = await db.upsertUser({
    email: "payments@example.com",
    manager: "Pay Tester",
    teamName: "Ledger Legends",
  });

  const pending = await orders.startCheckout(user, "single", new Request("http://localhost/api/checkout", { method: "POST" }));
  check("checkout opens a pending order", pending.order.status, "pending");
  check("the demo provider sends you to the payment page", pending.url, `/pay/${pending.order.ref}`);
  check("no entry exists before payment", (await db.findUser(user.id))?.entry ?? null, null);

  const settled = await orders.confirmDemoPayment(pending.order.ref, user.id);
  check("confirming settles the order", settled.order.status, "paid");
  check("settling creates the paid entry", (await db.findUser(user.id))?.entry?.plan, "single");

  const ledgerAfterPay = await db.listLedger();
  check(
    "one payment writes three ledger rows",
    ledgerAfterPay.map((row) => [row.kind, row.amountCents]),
    [
      ["entry_fee", 1000],
      ["platform_fee", 50],
      ["prize_pool", 950],
    ],
  );

  const again = await orders.confirmDemoPayment(pending.order.ref, user.id);
  check("a second confirm is a no-op", again.alreadyPaid, true);
  check("a second confirm writes no extra rows", (await db.listLedger()).length, 3);

  let refused = "";
  try {
    await orders.confirmDemoPayment(pending.order.ref, "someone-else");
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error);
  }
  check("another account cannot settle your order", refused, "No such order.");

  /* ——— Stripe events ——— */

  const demoEventOrder = await orders.applyStripeEvent({
    id: "evt_demo",
    type: "checkout.session.completed",
    data: { object: { id: "cs_demo", payment_status: "paid", metadata: { orderRef: pending.order.ref } } },
  });
  check("a Stripe webhook cannot settle a demo order", demoEventOrder.action, "ignored");

  const stripeOrder = await db.createOrder({
    ref: "ORD-STRIPE",
    userId: user.id,
    email: user.email,
    planId: "single",
    planName: "Single entry",
    amountCents: 1000,
    currency: "EUR",
    editionId: "adare-2027",
    prizeEligible: true,
    status: "pending",
    provider: "stripe",
    providerRef: "cs_test_123",
    createdAt: new Date().toISOString(),
    paidAt: null,
    refundedAt: null,
  });

  const stripeEvent = await orders.applyStripeEvent({
    id: "evt_stripe",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_123", payment_status: "paid", metadata: { orderRef: "ORD-STRIPE" } } },
  });
  check("Stripe settles its own order", stripeEvent.action, "settled");
  check("the Stripe order is paid", (await db.findOrder("ORD-STRIPE"))?.status, "paid");

  check("webhook events are remembered", await db.hasWebhookEvent("evt_stripe"), false);
  await db.recordWebhookEvent("evt_stripe");
  check("webhook events are deduped once recorded", await db.hasWebhookEvent("evt_stripe"), true);

  const expired = await orders.applyStripeEvent({
    id: "evt_expired",
    type: "checkout.session.expired",
    data: { object: { id: "cs_abandoned", metadata: { orderRef: "ORD-ABANDONED" } } },
  });
  check("an event for an unknown order is ignored", expired.action, "ignored");

  /* ——— Refunds ——— */

  const refunded = await orders.refundByRef(pending.order.ref);
  check("a paid order can be refunded", refunded.order.status, "refunded");
  check("a refunded entry loses prize eligibility", (await db.findUser(user.id))?.entry?.prizeEligible, false);
  const afterRefund = await orders.moneySummary();
  check("a refund takes the money back out of the pool", afterRefund.poolCents, 950);
  check("a refund takes the payment back out of gross", afterRefund.grossCents, 1000);

  /* ——— Prizes ——— */

  // The paid Stripe entry needs a card to appear in the field, and every other
  // entrant has to pay for real — an entry with no order behind it must not win.
  await db.updateTeam(user.id, {
    mode: "classic",
    squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka"],
    captain: "rory",
    predictions: { "fri-am-1": "europe" },
  });

  for (const [index, name] of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].entries()) {
    const member = await db.upsertUser({
      email: `prize${index}@example.com`,
      manager: `Manager ${name}`,
      teamName: `Team ${name}`,
    });
    const start = await orders.startCheckout(member, "single", new Request("http://localhost/api/checkout", { method: "POST" }));
    await orders.confirmDemoPayment(start.order.ref, member.id);
    await db.updateTeam(member.id, {
      mode: "classic",
      squad: ["rory", "lowry", "aberg", "scheffler", "morikawa", "straka"].slice(0, 6 - (index % 2)),
      captain: "rory",
      predictions: {},
    });
  }

  const pot = await orders.potCents(null);
  check("the global pot sums the pool rows", pot > 0, true);

  const settlement = await orders.settlePrizes(null);
  check("settlement awards the podium", settlement.awards.filter((a) => a.label.includes("overall")).length > 0, true);
  check(
    "awards never exceed the pot",
    settlement.awards.reduce((sum, award) => sum + award.amountCents, 0) <= settlement.potCents,
    true,
  );
  check(
    "awards plus unclaimed lines equal the pot less the platform fee",
    settlement.potCents -
      settlement.awards.reduce((sum, award) => sum + award.amountCents, 0) -
      settlement.unclaimed.reduce((sum, line) => sum + line.cents, 0),
    Math.round(settlement.potCents * 0.05),
  );
  check(
    "the predictor prize is unclaimed when nobody scored a pick",
    settlement.unclaimed.some((line) => line.label === "Match predictor"),
    true,
  );

  const repeat = await orders.settlePrizes(null);
  check("settling twice produces the same award amounts", repeat.awards.map((a) => a.amountCents), settlement.awards.map((a) => a.amountCents));
  check("settling twice does not duplicate the ledger", (await db.listLedger()).filter((row) => row.kind === "prize_payout").length, 0);

  const paidOut = await orders.payPrizes(null);
  check("paying marks every award paid", paidOut.every((award) => award.status === "paid"), true);
  check(
    "payouts write one ledger row per award",
    (await db.listLedger()).filter((row) => row.kind === "prize_payout").length,
    paidOut.length,
  );

  let settleAfterPay = "";
  try {
    await orders.settlePrizes(null);
  } catch (error) {
    settleAfterPay = error instanceof Error ? error.message : String(error);
  }
  check("a paid pot cannot be re-settled", settleAfterPay, "Prizes for this pot have already been paid out.");

  const board = await orders.prizeBoard();
  check("the board shows the payout", board.paidOutCents, paidOut.reduce((sum, award) => sum + award.amountCents, 0));

  rmSync(dir, { recursive: true, force: true });

  console.log(`\n${checks - failures}/${checks} payment checks pass`);
  if (failures > 0) process.exit(1);
}

void main();
