import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { getBreakdown } from "@/lib/server/standings";

export const dynamic = "force-dynamic";

/** The signed-in entry's points, with the working so the account page can show it. */
export async function GET() {
  const me = await currentUserId();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const breakdown = await getBreakdown(me);
  if (!breakdown) return NextResponse.json({ error: "No card saved yet." }, { status: 404 });
  return NextResponse.json(breakdown, { headers: { "cache-control": "no-store" } });
}
