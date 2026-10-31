import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { createLeague, listLeaguesFor } from "@/lib/server/db";
import { toView } from "@/lib/server/leagues";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentUserId();
  if (!me) return NextResponse.json({ signedIn: false, leagues: [] });
  const leagues = await listLeaguesFor(me);
  return NextResponse.json({
    signedIn: true,
    leagues: leagues.map(({ league, members }) => toView(league, members, me)),
  });
}

export async function POST(request: Request) {
  const me = await currentUserId();
  if (!me) return NextResponse.json({ error: "Join (free) first so your league has an owner." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; buyIn?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (name.length < 2) return NextResponse.json({ error: "Give your league a name." }, { status: 400 });
  const buyIn = Math.max(0, Math.min(100, Math.round(Number(body.buyIn) || 0)));
  const result = await createLeague(me, name, buyIn);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  const [created] = (await listLeaguesFor(me)).filter((l) => l.league.id === result.id);
  return NextResponse.json({ league: toView(created.league, created.members, me) }, { status: 201 });
}
