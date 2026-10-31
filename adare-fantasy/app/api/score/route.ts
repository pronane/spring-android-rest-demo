import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { getBreakdown } from "@/lib/server/standings";

export const dynamic = "force-dynamic";

/** The signed-in entry's points, with the working so the account page can show it. */
export async function GET(request: Request) {
  const me = await currentUserId();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const at = Number(new URL(request.url).searchParams.get("at"));
  const breakdown = await getBreakdown(me, {
    at: Number.isFinite(at) && at > 0 ? Math.min(3300, at) : undefined,
  });
  if (!breakdown) return NextResponse.json({ error: "No card saved yet." }, { status: 404 });
  return NextResponse.json(breakdown, { headers: { "cache-control": "no-store" } });
}
