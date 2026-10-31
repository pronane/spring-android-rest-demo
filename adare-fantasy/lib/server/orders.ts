/**
 * Payments and the prize ledger.
 *
 * The rule this module enforces: **an entry exists only because an order was
 * paid.** Checkout creates a pending order and returns a URL; the demo page or a
 * Stripe webhook settles it; settling writes the entry and three ledger rows in
 * one transaction. Everything is idempotent, because webhooks retry and people
 * double-click.
 */
import { randomUUID } from "node:crypto";
import { rankRows } from "@/lib/scoring";
import { PLANS } from "@/lib/tournaments";
import {
  attachProviderRef,
  createOrder,
  failOrder,
  findOrder,
  findOrderByProviderRef,
  listAllLeagues,
  listLedger,
  listOrders,
  listPrizes,
  markPrizesPaid,
  newOrderRef,
  refundOrder,
  savePrizeAwards,
  settleOrder,
  type LedgerRow,
  type Order,
  type PrizeAward,
  type User,
} from "./db";
import { awardableLines, allocate, cents } from "./money";
import { getStandings } from "./standings";
import {
  createCheckoutSession,
  paymentsProvider,
  type StripeEvent,
} from "./stripe";

export const ACTIVE_EDITION_ID = "adare-2027";

export type CheckoutStart = {
  order: Order;
  url: string;
  provider: "demo" | "stripe";
};

export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function appUrl(request: Request): string {
  return process.env.APP_URL ?? new URL(request.url).origin;
}

/**
 * Create a pending order for a plan and hand back where to pay. Nothing is
 * charged or granted here — that is the whole point.
 */
export async function startCheckout(
  user: User,
  planId: string,
  request: Request,
): Promise<CheckoutStart> {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) throw new CheckoutError("Unknown plan.", 400);

  const provider = paymentsProvider();
  const ref = newOrderRef();
  const order: Order = {
    ref,
    userId: user.id,
    email: user.email,
    planId: plan.id,
    planName: plan.name,
    amountCents: cents(plan.price),
    currency: plan.currency,
    editionId: ACTIVE_EDITION_ID,
    prizeEligible: plan.prizeEligible,
    status: "pending",
    provider,
    providerRef: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
    refundedAt: null,
  };
  await createOrder(order);

  if (provider === "demo") {
    return { order, url: `/pay/${ref}`, provider };
  }

  try {
    const session = await createCheckoutSession({
      orderRef: ref,
      planName: plan.name,
      amountCents: order.amountCents,
      currency: plan.currency,
      email: user.email,
      successUrl: `${appUrl(request)}/pay/${ref}?return=1`,
      cancelUrl: `${appUrl(request)}/enter?cancelled=${ref}`,
    });
    await attachProviderRef(ref, session.id);
    return { order: { ...order, providerRef: session.id }, url: session.url, provider };
  } catch (error) {
    await failOrder(ref, error instanceof Error ? error.message : "Checkout session failed");
    throw new CheckoutError(
      "Stripe could not open a checkout session — nothing has been charged. Try again or use the demo card.",
      502,
    );
  }
}

/** The demo "provider": the only thing that can settle a demo order. */
export async function confirmDemoPayment(
  ref: string,
  userId: string,
): Promise<{ order: Order; user: User; alreadyPaid: boolean }> {
  const order = await findOrder(ref);
  if (!order) throw new CheckoutError("No such order.", 404);
  if (order.userId !== userId) throw new CheckoutError("No such order.", 404);
  if (order.provider !== "demo") {
    throw new CheckoutError("This order is with Stripe — it settles when Stripe says so.", 409);
  }
  const settled = await settleOrder(order.ref);
  if (!settled) throw new CheckoutError("No such order.", 404);
  return settled;
}

export async function refundByRef(ref: string): Promise<{ order: Order; user: User }> {
  const order = await findOrder(ref);
  if (!order) throw new CheckoutError("No such order.", 404);
  if (order.status !== "paid" && order.status !== "refunded") {
    throw new CheckoutError("Only a paid order can be refunded.", 409);
  }
  const refunded = await refundOrder(ref, { note: "Refunded by an operator" });
  if (!refunded) throw new CheckoutError("Could not refund that order.", 409);
  return refunded;
}

/**
 * Apply a verified Stripe event. Refuses to touch orders created by the demo
 * provider, so a test-mode webhook cannot settle a fake card.
 */
export async function applyStripeEvent(
  event: StripeEvent,
): Promise<{ action: "settled" | "failed" | "refunded" | "ignored"; ref?: string; why?: string }> {
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const orderRef =
    (typeof metadata.orderRef === "string" && metadata.orderRef) ||
    (typeof object.client_reference_id === "string" && object.client_reference_id) ||
    null;

  const sessionId = typeof object.id === "string" ? object.id : null;
  const order = orderRef
    ? await findOrder(orderRef)
    : sessionId
      ? await findOrderByProviderRef(sessionId)
      : null;

  if (!order) return { action: "ignored", why: "no matching order" };

  if (event.type === "checkout.session.completed") {
    const paid = object.payment_status === undefined || object.payment_status === "paid";
    if (!paid) return { action: "ignored", ref: order.ref, why: "session completed but unpaid" };
    if (order.provider !== "stripe") {
      return { action: "ignored", ref: order.ref, why: "order belongs to the demo provider" };
    }
    await settleOrder(order.ref, { providerRef: sessionId });
    return { action: "settled", ref: order.ref };
  }

  if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
    if (order.status === "pending") {
      await failOrder(order.ref, event.type);
      return { action: "failed", ref: order.ref };
    }
    return { action: "ignored", ref: order.ref, why: `order already ${order.status}` };
  }

  if (event.type === "charge.refunded") {
    if (order.provider !== "stripe") {
      return { action: "ignored", ref: order.ref, why: "order belongs to the demo provider" };
    }
    const refunded = await refundOrder(order.ref, { note: "Stripe refund" });
    return refunded ? { action: "refunded", ref: order.ref } : { action: "ignored", ref: order.ref };
  }

  return { action: "ignored", ref: order.ref, why: `unhandled event ${event.type}` };
}

/* ——— Money views ——— */

export type MoneySummary = {
  provider: "demo" | "stripe";
  grossCents: number;
  feeCents: number;
  poolCents: number;
  paidOutCents: number;
  availableCents: number;
  orders: { pending: number; paid: number; failed: number; refunded: number };
};

function totals(rows: LedgerRow[]) {
  const sum = (kind: LedgerRow["kind"]) =>
    rows.filter((row) => row.kind === kind).reduce((total, row) => total + row.amountCents, 0);
  return {
    grossCents: sum("entry_fee") + sum("refund"),
    feeCents: sum("platform_fee"),
    poolCents: sum("prize_pool"),
    paidOutCents: -sum("prize_payout"),
  };
}

export async function moneySummary(editionId = ACTIVE_EDITION_ID): Promise<MoneySummary> {
  const [ledger, orders] = await Promise.all([listLedger(), listOrders()]);
  const scoped = ledger.filter((row) => row.editionId === editionId);
  const money = totals(scoped);
  const inEdition = orders.filter((order) => order.editionId === editionId);
  return {
    provider: paymentsProvider(),
    ...money,
    availableCents: money.poolCents - money.paidOutCents,
    orders: {
      pending: inEdition.filter((o) => o.status === "pending").length,
      paid: inEdition.filter((o) => o.status === "paid").length,
      failed: inEdition.filter((o) => o.status === "failed").length,
      refunded: inEdition.filter((o) => o.status === "refunded").length,
    },
  };
}

/**
 * Which pot a payment belongs to. Each entry funds the pot of the league its
 * owner plays in, or the global pot if they play alone — so every euro lands in
 * exactly one place and no euro is counted twice.
 */
export async function memberLeagueMap(): Promise<Map<string, string>> {
  const leagues = await listAllLeagues();
  const map = new Map<string, string>();
  for (const league of leagues) {
    for (const memberId of league.memberIds) map.set(memberId, league.id);
  }
  return map;
}

export async function potCents(
  leagueId: string | null,
  editionId = ACTIVE_EDITION_ID,
): Promise<number> {
  const [ledger, membership] = await Promise.all([listLedger(), memberLeagueMap()]);
  return ledger
    .filter((row) => row.editionId === editionId && row.kind === "prize_pool" && row.userId)
    .filter((row) =>
      leagueId ? membership.get(row.userId as string) === leagueId : !membership.has(row.userId as string),
    )
    .reduce((total, row) => total + row.amountCents, 0);
}

export function splitEvenly(amountCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const each = Math.floor(amountCents / parts);
  const remainder = amountCents - each * parts;
  return Array.from({ length: parts }, (_, index) => each + (index === 0 ? remainder : 0));
}

export type PrizeSettlement = {
  leagueId: string | null;
  potCents: number;
  awards: PrizeAward[];
  unclaimed: { label: string; cents: number; why: string }[];
};

/**
 * Settle the prizes for one pot: rank the eligible field, apply the published
 * split, and record who is owed what. Deterministic, so running it twice on an
 * unchanged table produces the same awards.
 */
export async function settlePrizes(
  leagueId: string | null = null,
  editionId = ACTIVE_EDITION_ID,
): Promise<PrizeSettlement> {
  const existing = (await listPrizes()).filter(
    (row) => row.editionId === editionId && row.leagueId === leagueId,
  );
  if (existing.some((row) => row.status === "paid")) {
    throw new CheckoutError("Prizes for this pot have already been paid out.", 409);
  }

  const pot = await potCents(leagueId, editionId);
  if (pot <= 0) {
    throw new CheckoutError("This pot is empty — no paid entries yet.", 409);
  }

  const membership = await memberLeagueMap();
  const standings = await getStandings({ leagueId: leagueId ?? undefined });
  // Mirror `potCents`: a league pot only pays league members, and the global pot
  // only pays entrants who are not in a league. Otherwise one fee funds two pots.
  const field = standings.rows.filter((row) =>
    leagueId ? membership.get(row.entryId) === leagueId : !membership.has(row.entryId),
  );
  // Places are awarded inside this pot, not in the global order: an entrant who
  // is 7th overall can still be 1st in a league of eight. Ineligible entries do
  // not take a place.
  const eligible = rankRows(
    field
      .filter((row) => row.prizeEligible)
      .map(({ rank: _rank, ...rest }) => rest),
  );

  const lines = awardableLines(pot);
  const byLabel = new Map(lines.map((line) => [line.label, line.cents]));
  const awards: PrizeAward[] = [];
  const unclaimed: PrizeSettlement["unclaimed"] = [];
  const settledAt = new Date().toISOString();

  const add = (row: (typeof eligible)[number], label: string, amountCents: number) => {
    if (amountCents <= 0) return;
    awards.push({
      id: randomUUID(),
      editionId,
      leagueId,
      potCents: pot,
      userId: row.entryId,
      teamName: row.team,
      place: row.rank,
      label,
      amountCents,
      status: "awarded",
      settledAt,
      paidAt: null,
    });
  };

  const podium: [string, number][] = [
    ["1st overall", 1],
    ["2nd overall", 2],
    ["3rd overall", 3],
  ];
  for (const [label, place] of podium) {
    const amount = byLabel.get(label) ?? 0;
    if (amount <= 0) continue;
    const row = eligible.find((candidate) => candidate.rank === place);
    if (row) add(row, label, amount);
    else unclaimed.push({ label, cents: amount, why: `no eligible entry in place ${place}` });
  }

  const topTen = byLabel.get("Top 10%") ?? 0;
  if (topTen > 0) {
    const depth = Math.max(1, Math.ceil(eligible.length * 0.1));
    const band = eligible.filter((row) => row.rank > 3).slice(0, depth);
    if (band.length) {
      splitEvenly(topTen, band.length).forEach((amount, index) => add(band[index], "Top 10%", amount));
    } else {
      unclaimed.push({ label: "Top 10%", cents: topTen, why: "nobody outside the podium" });
    }
  }

  const predictor = byLabel.get("Match predictor") ?? 0;
  if (predictor > 0) {
    const best = eligible.reduce<null | (typeof eligible)[number]>(
      (winner, row) => (!winner || row.predictions > winner.predictions ? row : winner),
      null,
    );
    if (best && best.predictions > 0) add(best, "Match predictor", predictor);
    else unclaimed.push({ label: "Match predictor", cents: predictor, why: "no prediction points scored" });
  }

  const session = byLabel.get("Best single session") ?? 0;
  if (session > 0) {
    unclaimed.push({
      label: "Best single session",
      cents: session,
      why: "per-session points are not stored yet — reserved for the next scoring pass",
    });
  }

  await savePrizeAwards({ editionId, leagueId }, awards);
  return { leagueId, potCents: pot, awards, unclaimed };
}

export async function payPrizes(
  leagueId: string | null = null,
  editionId = ACTIVE_EDITION_ID,
): Promise<PrizeAward[]> {
  const existing = (await listPrizes()).filter(
    (row) => row.editionId === editionId && row.leagueId === leagueId,
  );
  if (!existing.length) throw new CheckoutError("Nothing has been settled for this pot yet.", 409);
  return markPrizesPaid({ editionId, leagueId });
}

export type PotSummary = {
  leagueId: string | null;
  label: string;
  potCents: number;
  awardedCents: number;
  paidOutCents: number;
  toSettleCents: number;
};

/**
 * One row per pot: the global pot plus a pot for every league. Each entry fee
 * funds exactly one of them, so the rows add up to the whole pool.
 */
export async function prizeBoard(editionId = ACTIVE_EDITION_ID) {
  const [awards, ledger, leagues] = await Promise.all([listPrizes(), listLedger(), listAllLeagues()]);
  const scoped = awards.filter((row) => row.editionId === editionId);
  const money = totals(ledger.filter((row) => row.editionId === editionId));

  const pots: PotSummary[] = [];
  for (const league of [{ id: null as string | null, name: "Global" }, ...leagues.map((row) => ({ id: row.id, name: row.name }))]) {
    const leagueId = league.id;
    const pot = await potCents(leagueId, editionId);
    const rows = scoped.filter((row) => row.leagueId === leagueId);
    const awardedCents = rows
      .filter((row) => row.status === "awarded")
      .reduce((sum, row) => sum + row.amountCents, 0);
    const paidOutCents = rows
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + row.amountCents, 0);
    pots.push({
      leagueId,
      label: league.name,
      potCents: pot,
      awardedCents,
      paidOutCents,
      toSettleCents: Math.max(0, pot - awardedCents - paidOutCents),
    });
  }

  return {
    potCents: money.poolCents,
    awardedCents: scoped
      .filter((row) => row.status === "awarded")
      .reduce((sum, row) => sum + row.amountCents, 0),
    paidOutCents: money.paidOutCents,
    awards: scoped,
    pots,
  };
}

export { allocate };
