import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { joinLeagueByCode, listLeaguesFor } from "@/lib/server/db";
import { toView } from "@/lib/server/leagues";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const me = await currentUserId();
  if (!me) return NextResponse.json({ error: "Enter first, then use the code." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: "League codes are 4–8 letters and numbers." }, { status: 400 });
  }
  const result = await joinLeagueByCode(me, code);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  const [joined] = (await listLeaguesFor(me)).filter((l) => l.league.id === result.id);
  return NextResponse.json({ league: toView(joined.league, joined.members, me) });
}
