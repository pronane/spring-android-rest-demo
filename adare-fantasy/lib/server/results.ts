/**
 * Where results come from.
 *
 * Three layers, merged in this order:
 *
 *  1. the clock — which matches have finished (`lib/server/clock.ts`);
 *  2. the feed — when `LIVE_FEED_URL` is set, the provider's finals replace the
 *     simulation's, match by match (`lib/server/feed.ts`);
 *  3. the operator — corrections written through `/api/admin/results`.
 *
 * Only completed matches are in the snapshot, so a Sunday-morning request
 * scores the 16 matches that are in the books rather than guessing the rest.
 * That is the same snapshot the leaderboard, the share pages and the API use.
 */
import { PLAYER_BY_ID } from "@/lib/data";
import { applyFeed } from "@/lib/live";
import { matchesFor, simState, SESSIONS, type LiveMatch, type Match } from "@/lib/sim";
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
import type { LiveFeed } from "@/lib/live";
import { readResultsOverride, saveResultsOverride } from "./db";
import { scoringClock, phaseAt } from "./clock";
import { feedConfigured, readLiveFeed } from "./feed";

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

function fromLive(match: LiveMatch): ScoredMatch {
  return {
    id: match.id,
    no: match.no,
    sessionId: match.sessionId,
    format: match.format,
    europe: [...match.europe],
    usa: [...match.usa],
    result: match.result,
    events: match.liveEvents.map((event) => ({ playerId: event.playerId, kind: event.kind })),
  };
}

/**
 * The matches finished at `minute`: the simulation's clock, overlaid with the
 * feed when there is one. Feed finals win outright, including their events.
 */
function matchesAt(
  minute: number,
  feed: LiveFeed | null,
  seed = 2027,
): { matches: ScoredMatch[]; inPlay: number } {
  const state = feed ? applyFeed(simState(minute, seed), feed) : simState(minute, seed);
  return {
    matches: state.matches.filter((match) => match.status === "final").map(fromLive),
    inPlay: state.matches.filter((match) => match.status === "live").length,
  };
}

/** "Saturday foursomes, 9 of 12 matches in" — the header on a partial table. */
function phaseLabel(minute: number, finals: number): string {
  if (finals >= TOTAL_MATCHES) return "All 28 matches in the books";
  const session = [...SESSIONS].reverse().find((s) => minute >= s.startMin);
  if (!session) return "No match has finished yet";
  const done = Math.min(finals, TOTAL_MATCHES);
  return `${session.day} · ${session.label} · ${done} of ${TOTAL_MATCHES} finished`;
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

export type ResultsOptions = {
  /** Tournament minute to score to. Defaults to the server clock. */
  minute?: number;
  /** Set false to score the simulation even when a feed is configured. */
  feed?: boolean;
  seed?: number;
};

/**
 * The current results snapshot: the clock, the feed, and any operator
 * corrections on top.
 */
export async function getResults(options: ResultsOptions = {}): Promise<Results> {
  const seed = options.seed ?? 2027;
  const clock = scoringClock();
  const minute = options.minute ?? clock.minute;

  const read = options.feed === false || !feedConfigured() ? { feed: null, error: null } : await readLiveFeed();
  const override = await readResultsOverride();
  const snapshot = matchesAt(minute, read.feed, seed);
  const matches = mergeOverride(snapshot.matches, override);
  const simulated = simulatedAwards(matches);
  const awards: Awards = { ...simulated, ...(override?.awards ?? {}) };
  const corrected = Boolean(override?.matches && Object.keys(override.matches).length > 0);
  const source: Results["source"] = corrected
    ? "mixed"
    : read.feed
      ? "feed"
      : "simulation";
  const provisional = matches.length < TOTAL_MATCHES;

  return {
    matches,
    awards,
    cup: cupFrom(matches),
    finals: matches.length,
    total: TOTAL_MATCHES,
    updatedAt: override?.updatedAt ?? read.feed?.updatedAt ?? new Date(0).toISOString(),
    source,
    minute,
    phase: phaseAt(minute),
    inPlay: snapshot.inPlay,
    provisional,
    clock: phaseLabel(minute, matches.length),
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
