import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { TransferError, makeTransfer, transferOverview, updateSessionCaptains } from "@/lib/server/transfers";

export const dynamic = "force-dynamic";

/**
 * The saved card after the lock: the transfer windows, the allowance, and the
 * armband for each day. Everything is read from the store and scored from the
 * server clock — the browser only draws it.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    return NextResponse.json(await transferOverview(userId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof TransferError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read the card." }, { status });
  }
}

/** One swap. Free within the allowance, −4 points after that. */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { out?: unknown; in?: unknown };
  try {
    const result = await makeTransfer(userId, body);
    return NextResponse.json({ ok: true, penalty: result.penalty, ...result.overview });
  } catch (error) {
    const status = error instanceof TransferError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transfer failed." }, { status });
  }
}

/** The armband, day by day: { fri, sat, sun } with a player id, or null. */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json({ ok: true, ...(await updateSessionCaptains(userId, body)) });
  } catch (error) {
    const status = error instanceof TransferError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not set the armband." }, { status });
  }
}
