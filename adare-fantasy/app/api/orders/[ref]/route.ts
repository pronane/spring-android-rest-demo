import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { findOrder, findUser } from "@/lib/server/db";
import { formatMoney } from "@/lib/server/money";

export const dynamic = "force-dynamic";

/** Order status for the payment page. Owners only — an order ref is not a secret. */
export async function GET(_request: Request, context: { params: Promise<{ ref: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { ref } = await context.params;
  const order = await findOrder(ref);
  if (!order || order.userId !== userId) {
    return NextResponse.json({ error: "No such order." }, { status: 404 });
  }

  const user = order.status === "paid" ? await findUser(order.userId) : null;

  return NextResponse.json({
    order: {
      ref: order.ref,
      status: order.status,
      planId: order.planId,
      planName: order.planName,
      amountCents: order.amountCents,
      amountLabel: formatMoney(order.amountCents, order.currency),
      currency: order.currency,
      provider: order.provider,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      note: order.note ?? null,
    },
    entry: user?.entry
      ? { ref: user.entry.ref, plan: user.entry.plan, amount: user.entry.amount, paidAt: user.entry.paidAt }
      : null,
  });
}
