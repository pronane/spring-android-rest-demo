import { NextResponse } from "next/server";
import { adminAuth, adminRefusal } from "@/lib/server/admin";
import { listOrders } from "@/lib/server/db";
import { CheckoutError, moneySummary, refundByRef } from "@/lib/server/orders";

export const dynamic = "force-dynamic";

/** Operator view of every payment attempt, and refunds. */
export async function GET(request: Request) {
  const auth = adminAuth(request);
  if (auth !== "ok") return adminRefusal(auth);

  const [orders, money] = await Promise.all([listOrders(), moneySummary()]);
  return NextResponse.json({
    money,
    orders: orders
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => ({
        ref: order.ref,
        email: order.email,
        planId: order.planId,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        provider: order.provider,
        providerRef: order.providerRef,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        refundedAt: order.refundedAt,
        note: order.note ?? null,
      })),
  });
}

export async function POST(request: Request) {
  const auth = adminAuth(request);
  if (auth !== "ok") return adminRefusal(auth);

  const body = (await request.json().catch(() => ({}))) as { ref?: string; action?: string };
  if (!body.ref) return NextResponse.json({ error: "An order ref is required." }, { status: 400 });
  if (body.action !== "refund") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const refunded = await refundByRef(body.ref);
    return NextResponse.json({
      refunded: true,
      order: { ref: refunded.order.ref, status: refunded.order.status },
      prizeEligible: refunded.user.entry?.prizeEligible ?? false,
    });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refund failed." },
      { status },
    );
  }
}
