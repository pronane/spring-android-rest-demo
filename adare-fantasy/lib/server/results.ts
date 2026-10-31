/**
 * Where results come from.
 *
 * Until a real feed exists the simulation is the source of truth: `matchesFor()`
 * is seeded, so every process, restart and request sees the same 28 results.
 * An operator can correct any match or award through `/api/admin/results`; those
 * overrides live in the store and are merged on top of the simulation here.
 *
 * The live feed adapter in `lib/live.ts` supplies the same shape at runtime, so
 * swapping it in means replacing `simulatedMatches()` below and nothing else.
 */
import { PLAYER_BY_ID } from "@/lib/data";
import { matchesFor, type Match } from "@/lib/sim";
import {
  cupFrom,
  type Awards,
  type MatchEvent,
  type Results,
  type ResultsOverride,
  type ScoredMatch,
  type PlayerPoints,
  scoreCard,
} from "@/lib/scoring";
import { readResultsOverride, saveResultsOverride } from "./db";

const TOTAL_MATCHES = 28;

function toScoredMatch(match: Match): ScoredMatch {
  return {
    id: match.id,
    no: match.no,
    sessionId: match.sessionId,
    format: match.format,
    europe: [...match.europe],
    usa: [...match.usa],
    result: match.result,
    events: match.events.map((event) => ({ playerId: event.playerId, kind: event.kind })),
  };
}

function simulatedMatches(seed = 2027): ScoredMatch[] {
  return matchesFor(seed).map(toScoredMatch);
}

/**
 * Simulated awards, so the predictor's award picks can resolve in the demo:
 * MVP is the highest scorer, top scorer is the player who won most match points,
 * and the rookie is the best of the captain's picks.
 */
function simulatedAwards(matches: ScoredMatch[]): Awards {
  const board = new Map<string, PlayerPoints>();
  for (const id of Object.keys(PLAYER_BY_ID)) {
    board.set(id, {
      playerId: id,
      matches: 0,
      wins: 0,
      halves: 0,
      losses: 0,
      birdies: 0,
      eagles: 0,
      albatrosses: 0,
      matchPoints: 0,
      bonusPoints: 0,
      total: 0,
    });
  }
  const scored = scoreCard(
    { squad: [...board.keys()], captain: null, mode: "classic" },
    {
      matches,
      awards: { mvp: null, topScorer: null, rookie: null },
      cup: cupFrom(matches),
      finals: matches.length,
      total: TOTAL_MATCHES,
      updatedAt: "",
      source: "simulation",
    },
  );
  const played = scored.players.filter((row) => row.matches > 0);
  const best = (rows: PlayerPoints[]) =>
    rows.length === 0 ? null : [...rows].sort((a, b) => b.total - a.total)[0].playerId;

  return {
    mvp: best(played),
    topScorer: [...played].sort((a, b) => b.matchPoints - a.matchPoints)[0]?.playerId ?? null,
    rookie: best(played.filter((row) => PLAYER_BY_ID[row.playerId]?.role === "Captain's pick")),
  };
}

function mergeOverride(matches: ScoredMatch[], override: ResultsOverride | null): ScoredMatch[] {
  if (!override?.matches) return matches;
  return matches.map((match) => {
    const patch = override.matches?.[match.id];
    if (!patch) return match;
    return {
      ...match,
      result: patch.result,
      events: patch.events ? patch.events.filter((event) => PLAYER_BY_ID[event.playerId]) : match.events,
    };
  });
}

/** The current results snapshot: simulation, with any operator corrections on top. */
export async function getResults(seed = 2027): Promise<Results> {
  const override = await readResultsOverride();
  const matches = mergeOverride(simulatedMatches(seed), override);
  const simulated = simulatedAwards(matches);
  const awards: Awards = { ...simulated, ...(override?.awards ?? {}) };
  const source: Results["source"] = !override
    ? "simulation"
    : override.matches && Object.keys(override.matches).length > 0
      ? "mixed"
      : "admin";

  return {
    matches,
    awards,
    cup: cupFrom(matches),
    finals: matches.length,
    total: TOTAL_MATCHES,
    updatedAt: override?.updatedAt ?? new Date(0).toISOString(),
    source,
  };
}

export type OverrideInput = {
  matches?: Record<string, { result: "europe" | "usa" | "half"; events?: MatchEvent[] }>;
  awards?: Partial<Awards>;
  updatedBy?: string;
};

const PICKS = new Set(["europe", "usa", "half"]);

/**
 * Applies an operator correction. Unknown match ids and player ids are dropped
 * rather than rejected wholesale, so one typo doesn't discard a whole batch.
 */
export async function applyOverride(input: OverrideInput): Promise<{ results: Results; applied: number; dropped: string[] }> {
  const base = simulatedMatches();
  const known = new Map(base.map((match) => [match.id, match]));
  const previous = (await readResultsOverride()) ?? { updatedAt: new Date().toISOString() };
  const patches = { ...(previous.matches ?? {}) };
  const dropped: string[] = [];

  for (const [id, patch] of Object.entries(input.matches ?? {})) {
    if (!known.has(id) || !PICKS.has(patch.result)) {
      dropped.push(id);
      continue;
    }
    patches[id] = {
      result: patch.result,
      ...(patch.events
        ? { events: patch.events.filter((event) => PLAYER_BY_ID[event.playerId]) }
        : {}),
    };
  }

  await saveResultsOverride({
    matches: patches,
    awards: { ...(previous.awards ?? {}), ...(input.awards ?? {}) },
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  });

  return { results: await getResults(), applied: Object.keys(input.matches ?? {}).length - dropped.length, dropped };
}

/** Drops every correction and returns to the simulation. */
export async function clearOverride(): Promise<Results> {
  await saveResultsOverride(null);
  return getResults();
}
