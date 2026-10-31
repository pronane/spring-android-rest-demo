import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { findUser } from "@/lib/server/db";
import { CheckoutError, startCheckout } from "@/lib/server/orders";

export const dynamic = "force-dynamic";

/**
 * Open a checkout. This used to mark an entry paid on the spot; it now creates a
 * **pending** order and returns where to pay. An entry only appears when the
 * order settles — via the Stripe webhook, or the demo payment page.
 */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Create your account details first — the entry needs an email." },
      { status: 401 },
    );
  }

  const user = await findUser(userId);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { planId?: string; referralCode?: string };
  try {
    const start = await startCheckout(
      user,
      body.planId ?? "single",
      request,
      typeof body.referralCode === "string" ? body.referralCode.slice(0, 32) : null,
    );
    return NextResponse.json({
      order: {
        ref: start.order.ref,
        status: start.order.status,
        planId: start.order.planId,
        planName: start.order.planName,
        amountCents: start.order.amountCents,
        currency: start.order.currency,
      },
      url: start.url,
      provider: start.provider,
    });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed." },
      { status },
    );
  }
}
