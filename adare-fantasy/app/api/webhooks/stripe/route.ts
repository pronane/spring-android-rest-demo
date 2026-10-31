import { NextResponse } from "next/server";
import { hasWebhookEvent, recordWebhookEvent } from "@/lib/server/db";
import { applyStripeEvent } from "@/lib/server/orders";
import { parseStripeEvent, verifyStripeSignature } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook. The body is read as text — never parsed first — because the
 * signature covers the exact bytes; and the endpoint fails closed (503) when no
 * webhook secret is configured rather than trusting unverified JSON.
 *
 * Events are applied once: Stripe retries for up to three days, and a retried
 * `checkout.session.completed` must not produce a second entry or a second
 * ledger row.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhooks are disabled — set STRIPE_WEBHOOK_SECRET to receive them." },
      { status: 503 },
    );
  }

  const raw = await request.text();
  const signature = verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret);
  if (!signature.ok) {
    return NextResponse.json({ error: `Invalid signature: ${signature.reason}` }, { status: 400 });
  }

  const event = parseStripeEvent(raw);
  if (!event) {
    return NextResponse.json({ error: "Malformed event." }, { status: 400 });
  }

  if (await hasWebhookEvent(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const result = await applyStripeEvent(event);
  await recordWebhookEvent(event.id);
  return NextResponse.json({ received: true, ...result });
}
