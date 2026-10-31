import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { getStandings } from "@/lib/server/standings";

export const dynamic = "force-dynamic";

/**
 * Standings. Without `?league=` this is the global table; with a league id it is
 * that private league, and only its members are scored (`me` must be one of
 * them, otherwise the table is empty).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const leagueId = url.searchParams.get("league") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const me = await currentUserId();

  const standings = await getStandings({
    leagueId,
    me,
    limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
  });

  if (leagueId && standings.scope.kind === "league" && !standings.scope.name) {
    return NextResponse.json({ error: "That league is not yours." }, { status: 404 });
  }

  return NextResponse.json(standings, { headers: { "cache-control": "no-store" } });
}
