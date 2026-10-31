import { NextResponse } from "next/server";
import { adminAuth, adminRefusal } from "@/lib/server/admin";
import { listPrizes } from "@/lib/server/db";
import { CheckoutError, payPrizes, prizeBoard, settlePrizes } from "@/lib/server/orders";

export const dynamic = "force-dynamic";

/** The prize ledger: what the pot is, who is owed what, and what has been paid. */
export async function GET(request: Request) {
  const auth = adminAuth(request);
  if (auth !== "ok") return adminRefusal(auth);

  const board = await prizeBoard();
  return NextResponse.json({
    potCents: board.potCents,
    awardedCents: board.awardedCents,
    paidOutCents: board.paidOutCents,
    pots: board.pots,
    awards: board.awards.map((row) => ({
      id: row.id,
      leagueId: row.leagueId,
      userId: row.userId,
      team: row.teamName,
      place: row.place,
      label: row.label,
      amountCents: row.amountCents,
      status: row.status,
      settledAt: row.settledAt,
      paidAt: row.paidAt,
    })),
    all: (await listPrizes()).length,
  });
}

export async function POST(request: Request) {
  const auth = adminAuth(request);
  if (auth !== "ok") return adminRefusal(auth);

  const body = (await request.json().catch(() => ({}))) as {
    action?: "settle" | "pay";
    leagueId?: string | null;
  };
  const leagueId = body.leagueId ?? null;

  try {
    if (body.action === "settle") {
      const settlement = await settlePrizes(leagueId);
      return NextResponse.json({
        settled: true,
        potCents: settlement.potCents,
        awards: settlement.awards,
        unclaimed: settlement.unclaimed,
      });
    }
    if (body.action === "pay") {
      const paid = await payPrizes(leagueId);
      return NextResponse.json({ paid: true, awards: paid });
    }
    return NextResponse.json({ error: "Unknown action — use settle or pay." }, { status: 400 });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prize action failed." },
      { status },
    );
  }
}
