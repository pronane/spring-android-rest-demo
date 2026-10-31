/**
 * Stripe, without the SDK.
 *
 * Two things are needed: creating hosted Checkout Sessions, and verifying that a
 * webhook really came from Stripe. Both are small enough to do against the REST
 * API with `fetch` and `node:crypto` — which keeps the demo dependency-free and,
 * more usefully, keeps the signature check testable offline (see
 * `scripts/payments-check.ts`).
 *
 * In production, swap `stripeRequest` for the official `stripe` package; the
 * signature rules below are exactly what `stripe.webhooks.constructEvent` does.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Reject signatures older than this, so a captured header cannot be replayed. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const API_BASE = process.env.STRIPE_API_BASE ?? "https://api.stripe.com";

export type PaymentProvider = "demo" | "stripe";

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key && key.length > 8 ? key : null;
}

/**
 * Which provider the app uses. An explicit `PAYMENTS_PROVIDER` wins, so tests and
 * demos can pin the fake card flow even when a key is present.
 */
export function paymentsProvider(): PaymentProvider {
  const explicit = process.env.PAYMENTS_PROVIDER;
  if (explicit === "stripe" || explicit === "demo") return explicit;
  return stripeSecretKey() ? "stripe" : "demo";
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/**
 * Verify a `Stripe-Signature` header: `t=<unix>,v1=<hmac>,v1=<hmac>` where each
 * HMAC is SHA-256 over `${t}.${rawBody}` keyed with the webhook secret.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!header) return { ok: false, reason: "missing signature header" };
  if (!secret) return { ok: false, reason: "missing webhook secret" };

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=").map((piece) => piece?.trim());
    if (!key || !value) continue;
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }

  if (!timestamp || !/^\d+$/.test(timestamp)) return { ok: false, reason: "malformed timestamp" };
  if (!signatures.length) return { ok: false, reason: "no v1 signature" };

  const age = nowSeconds - Number(timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "timestamp too old" };
  if (age < -SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "timestamp in the future" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  for (const signature of signatures) {
    let given: Buffer;
    try {
      given = Buffer.from(signature, "hex");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}

/** Sign a payload the way Stripe does — used by the tests and the harness. */
export function signStripePayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function parseStripeEvent(payload: string): StripeEvent | null {
  try {
    const parsed = JSON.parse(payload) as Partial<StripeEvent>;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.type !== "string") return null;
    if (!parsed.data || typeof parsed.data !== "object" || !parsed.data.object) return null;
    return parsed as StripeEvent;
  } catch {
    return null;
  }
}

export type CheckoutSession = { id: string; url: string };

/**
 * Create a hosted Checkout Session. Form-encoded because that is what Stripe's
 * API takes; `STRIPE_API_BASE` can point at the harness stub.
 */
export async function createCheckoutSession(input: {
  orderRef: string;
  planName: string;
  amountCents: number;
  currency: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const key = stripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  const form = new URLSearchParams({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.email,
    client_reference_id: input.orderRef,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": input.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][price_data][product_data][name]": `Twenty-Eight · ${input.planName}`,
    "metadata[orderRef]": input.orderRef,
    "payment_intent_data[metadata][orderRef]": input.orderRef,
  });

  const res = await fetch(`${API_BASE}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": input.orderRef,
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Stripe rejected the checkout session (${res.status}): ${detail.slice(0, 160)}`);
  }

  const session = (await res.json()) as { id?: string; url?: string };
  if (!session.id || !session.url) throw new Error("Stripe returned a session without an id or url");
  return { id: session.id, url: session.url };
}

/** Refund a payment. The webhook does the bookkeeping; this just moves the money. */
export async function refundStripePayment(paymentIntent: string): Promise<boolean> {
  const key = stripeSecretKey();
  if (!key || !paymentIntent) return false;
  const res = await fetch(`${API_BASE}/v1/refunds`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ payment_intent: paymentIntent }).toString(),
  });
  return res.ok;
}
