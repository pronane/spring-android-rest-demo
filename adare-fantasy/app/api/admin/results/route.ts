import { NextResponse } from "next/server";
import { adminAuth, adminRefusal } from "@/lib/server/admin";
import { applyOverride, clearOverride, getResults } from "@/lib/server/results";
import type { MatchEvent } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/**
 * Operator corrections. Results normally come from the simulation (later, a
 * feed); this endpoint exists so a wrong match, a missing birdie or an award can
 * be fixed without editing the store by hand.
 *
 * Auth is a bearer token compared in constant time. With `ADMIN_TOKEN` unset the
 * endpoint is disabled rather than open — failing closed matters more than
 * convenience here.
 */
export async function GET(request: Request) {
  const auth = adminAuth(request);
  if (auth !== "ok") return adminRefusal(auth);
  const results = await getResults();
  return NextResponse.json({
    source: results.source,
    updatedAt: results.updatedAt,
    finals: results.finals,
    total: results.total,
    cup: results.cup,
    awards: results.awards,
    matches: results.matches.map((match) => ({ id: match.id, result: match.result, events: match.events.length })),
  });
}

export async function POST(request: Request) {
  const auth = adminAuth(request);
  if (auth !== "ok") return adminRefusal(auth);

  const body = (await request.json().catch(() => ({}))) as {
    matches?: Record<string, { result?: unknown; events?: unknown }>;
    awards?: Record<string, unknown>;
    updatedBy?: string;
  };

  const matches: Record<string, { result: "europe" | "usa" | "half"; events?: MatchEvent[] }> = {};
  for (const [id, patch] of Object.entries(body.matches ?? {})) {
    if (!patch || typeof patch !== "object") continue;
    const result = (patch as { result?: unknown }).result;
    if (result !== "europe" && result !== "usa" && result !== "half") continue;
    const events = Array.isArray((patch as { events?: unknown }).events)
      ? ((patch as { events: unknown[] }).events
          .filter((event): event is MatchEvent => {
            if (!event || typeof event !== "object") return false;
            const { playerId, kind } = event as { playerId?: unknown; kind?: unknown };
            return (
              typeof playerId === "string" &&
              (kind === "birdie" || kind === "eagle" || kind === "albatross")
            );
          }) as MatchEvent[])
      : undefined;
    matches[id] = { result, ...(events ? { events } : {}) };
  }

  const awards: Record<string, string | null> = {};
  for (const key of ["mvp", "topScorer", "rookie"] as const) {
    const value = body.awards?.[key];
    if (typeof value === "string" || value === null) awards[key] = value;
  }

  if (Object.keys(matches).length === 0 && Object.keys(awards).length === 0) {
    return NextResponse.json({ error: "Nothing to apply — send matches and/or awards." }, { status: 400 });
  }

  const { results, applied, dropped } = await applyOverride({
    matches,
    awards,
    updatedBy: typeof body.updatedBy === "string" ? body.updatedBy.slice(0, 80) : undefined,
  });

  return NextResponse.json({
    ok: true,
    applied,
    dropped,
    source: results.source,
    updatedAt: results.updatedAt,
    cup: results.cup,
    awards: results.awards,
  });
}

export async function DELETE(request: Request) {
  const auth = adminAuth(request);
  if (auth !== "ok") return adminRefusal(auth);
  const results = await clearOverride();
  return NextResponse.json({ ok: true, source: results.source, cup: results.cup, awards: results.awards });
}
