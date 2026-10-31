import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { CheckoutError, confirmDemoPayment } from "@/lib/server/orders";

export const dynamic = "force-dynamic";

/**
 * The demo payment provider. Refused outright for Stripe orders — those settle
 * only when Stripe's webhook says so — so the state machine is the same one a
 * real payment uses, with the money replaced by a button.
 */
export async function POST(_request: Request, context: { params: Promise<{ ref: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { ref } = await context.params;
  try {
    const settled = await confirmDemoPayment(ref, userId);
    return NextResponse.json({
      paid: true,
      alreadyPaid: settled.alreadyPaid,
      order: { ref: settled.order.ref, status: settled.order.status, paidAt: settled.order.paidAt },
      entry: settled.user.entry,
    });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment failed." },
      { status },
    );
  }
}
