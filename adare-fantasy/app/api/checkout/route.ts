import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { findUser, saveEntry } from "@/lib/server/db";
import { PLANS } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

/**
 * Demo checkout. No card data is stored or forwarded, no money moves — the
 * endpoint simply marks the entry as paid and returns a receipt reference.
 */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Create your account details first — the entry needs an email." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  const plan = PLANS.find((p) => p.id === body.planId) ?? PLANS[0];

  const user = await saveEntry(userId, {
    plan: plan.id,
    amount: plan.price,
    editionId: "adare-2027",
  });

  return NextResponse.json({
    paid: true,
    entry: user?.entry,
    user: await findUser(userId),
    receipt: {
      ref: user?.entry?.ref,
      plan: plan.name,
      amount: plan.price,
      note: "Demo payment — no card was charged.",
    },
  });
}
