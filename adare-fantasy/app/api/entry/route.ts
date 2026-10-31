import { NextResponse } from "next/server";
import { PLAYER_BY_ID } from "@/lib/data";
import { isLocked, validateSquad } from "@/lib/helpers";
import { currentUserId } from "@/lib/server/auth";
import { updateTeam } from "@/lib/server/db";
import { cleanGuess, PINPOINT_DAYS, type PinpointGuess } from "@/lib/pinpoint";
import { pairingsFor } from "@/lib/sim";
import { ACTIVE_EDITION } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

const PICKS = new Set(["europe", "usa", "half"]);
const AWARD_KEYS = ["mvp", "topScorer", "rookie"] as const;

type Body = {
  mode?: unknown;
  squad?: unknown;
  captain?: unknown;
  predictions?: unknown;
  awards?: unknown;
  pinpoint?: unknown;
  sessionCaptains?: unknown;
};

/**
 * Saves the signed-in user's card. The browser enforces the rules too, but the
 * server is the source of truth for a paid game, so everything is re-checked
 * here: squad shape and budget, captain in squad, known match ids, and the lock.
 */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (isLocked(ACTIVE_EDITION.firstTee)) {
    return NextResponse.json(
      { error: "Cards locked at the first tee — no more changes." },
      { status: 423 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const mode = body.mode === "full" ? "full" : "classic";

  const squad = Array.isArray(body.squad)
    ? body.squad.filter((id): id is string => typeof id === "string")
    : [];
  const squadErrors = validateSquad(squad, mode);
  if (squadErrors.length > 0) {
    return NextResponse.json({ error: squadErrors[0], errors: squadErrors }, { status: 422 });
  }

  const captain = typeof body.captain === "string" ? body.captain : null;
  if (!captain || !squad.includes(captain)) {
    return NextResponse.json({ error: "Pick a captain from your card." }, { status: 422 });
  }

  const matchIds = new Set(pairingsFor().map((m) => m.id));
  const predictions: Record<string, string> = {};
  if (body.predictions && typeof body.predictions === "object") {
    for (const [id, pick] of Object.entries(body.predictions as Record<string, unknown>)) {
      if (matchIds.has(id) && typeof pick === "string" && PICKS.has(pick)) predictions[id] = pick;
    }
  }

  const rawAwards = (body.awards && typeof body.awards === "object" ? body.awards : {}) as Record<
    string,
    unknown
  >;
  const awards = Object.fromEntries(
    AWARD_KEYS.map((key) => {
      const v = rawAwards[key];
      return [key, typeof v === "string" && PLAYER_BY_ID[v] ? v : null];
    }),
  ) as { mvp: string | null; topScorer: string | null; rookie: string | null };

  const rawPinpoint = (body.pinpoint && typeof body.pinpoint === "object" ? body.pinpoint : {}) as Record<
    string,
    unknown
  >;
  const pinpoint: Record<string, PinpointGuess> = {};
  for (const day of PINPOINT_DAYS) {
    if (rawPinpoint[day.id] !== undefined) pinpoint[day.id] = cleanGuess(rawPinpoint[day.id]);
  }

  // The armband per day, if the player set one. Each must be on the card.
  let sessionCaptains: Record<string, string | null> | undefined;
  if (body.sessionCaptains && typeof body.sessionCaptains === "object") {
    sessionCaptains = {};
    for (const day of ["fri", "sat", "sun"] as const) {
      const value = (body.sessionCaptains as Record<string, unknown>)[day];
      if (value === null) sessionCaptains[day] = null;
      else if (typeof value === "string" && squad.includes(value)) sessionCaptains[day] = value;
    }
  }

  const user = await updateTeam(userId, {
    mode,
    squad,
    captain,
    predictions,
    awards,
    pinpoint,
    ...(sessionCaptains ? { sessionCaptains } : {}),
  });
  if (!user) {
    return NextResponse.json(
      { error: "No paid entry on this account yet." },
      { status: 402 },
    );
  }
  return NextResponse.json({ ok: true, user });
}
