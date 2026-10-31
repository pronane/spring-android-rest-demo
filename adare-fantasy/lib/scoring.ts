/**
 * Fantasy scoring engine.
 *
 * Everything here is pure: it takes a card (squad + captain + predictions) and a
 * `Results` snapshot and returns points. That keeps the rules testable without a
 * browser, a database or the simulation — see `scripts/scoring-check.mjs`.
 *
 * Results can come from the simulation (the default until a real feed exists),
 * from an admin correction, or from a live provider. Nothing in this file cares
 * which, and the same numbers are used by the live page, the leaderboard and the
 * account breakdown.
 */
import { SCORING } from "./data";
import type { Pick } from "./sim";
import type { ModeId } from "./tournaments";

export const PREDICT_POINTS = {
  /** Each match called correctly. */
  match: 2,
  /** The exact cup scoreline. */
  exact: 10,
  /** Each award called correctly (MVP, top scorer, rookie). */
  award: 5,
} as const;

export type EventKind = "birdie" | "eagle" | "albatross";
export type MatchEvent = { playerId: string; kind: EventKind };

/** A completed match, with the pairings, so scoring never needs the simulation. */
export type ScoredMatch = {
  id: string;
  no: number;
  sessionId: string;
  format: "foursomes" | "fourball" | "singles";
  europe: string[];
  usa: string[];
  result: Pick;
  events: MatchEvent[];
};

export type Awards = {
  mvp: string | null;
  topScorer: string | null;
  rookie: string | null;
};

export type Results = {
  /** Final matches only, in playing order. */
  matches: ScoredMatch[];
  awards: Awards;
  cup: { europe: number; usa: number };
  finals: number;
  total: number;
  updatedAt: string;
  source: "simulation" | "feed" | "admin" | "mixed";
  /**
   * Where the weekend had got to when this snapshot was taken. Only completed
   * matches are scored, so a mid-Sunday snapshot is a real, provisional table
   * rather than a projection.
   */
  minute?: number;
  phase?: "pre" | "live" | "done";
  inPlay?: number;
  provisional?: boolean;
  clock?: string;
};

/** What an operator can change without touching the simulation. */
export type ResultsOverride = {
  matches?: Record<string, { result: Pick; events?: MatchEvent[] }>;
  awards?: Partial<Awards>;
  updatedAt: string;
  updatedBy?: string;
};

/** The armband can move day by day: Friday, Saturday, Sunday. */
export type SessionCaptains = Partial<Record<"fri" | "sat" | "sun", string | null>>;

export type CardInput = {
  squad: string[];
  captain: string | null;
  mode: ModeId;
  /**
   * Optional per-day armband. A day present with a player id doubles that
   * player's match points that day; a day present as `null` means no armband
   * that day; a day absent falls back to `captain`.
   */
  sessionCaptains?: SessionCaptains;
};

export type PredictionInput = {
  predictions?: Record<string, Pick>;
  awards?: Awards;
};

export type PlayerPoints = {
  playerId: string;
  matches: number;
  wins: number;
  halves: number;
  losses: number;
  birdies: number;
  eagles: number;
  albatrosses: number;
  /** Win/half points after the captain multiplier. */
  matchPoints: number;
  /** Appearance + birdie/eagle/albatross + unbeaten bonus. */
  bonusPoints: number;
  total: number;
};

export type CardScore = {
  total: number;
  players: PlayerPoints[];
  captainId: string | null;
  sessionCaptains: SessionCaptains;
  /** Match points added by the armband, so the change is visible in the UI. */
  captainBonus: number;
  unbeaten: string[];
};

export type PredictionScore = {
  total: number;
  matchHits: number;
  matchPoints: number;
  awardHits: string[];
  awardPoints: number;
  exact: boolean;
  exactPoints: number;
  /** The cup score the predictions imply, and the real one. */
  predictedCup: { europe: number; usa: number };
  actualCup: { europe: number; usa: number };
};

export type EntryScore = {
  /** Net of any transfer penalties. */
  total: number;
  /** Card + predictions before penalties. */
  gross: number;
  transferPenalty: number;
  card: CardScore;
  predictions: PredictionScore;
};

const DAY_ORDER = ["fri", "sat", "sun"] as const;
export type SessionDay = (typeof DAY_ORDER)[number];

/** `fri-am-3` → `fri`. */
export function sessionDay(sessionId: string): SessionDay | null {
  const day = sessionId.split("-")[0];
  return (DAY_ORDER as readonly string[]).includes(day) ? (day as SessionDay) : null;
}

const EVENT_POINTS: Record<EventKind, number> = {
  birdie: SCORING.birdie,
  eagle: SCORING.eagle,
  albatross: SCORING.albatross,
};

/** Match value is worth more on Sunday, and halved matches still pay. */
export function matchValue(format: ScoredMatch["format"], result: Pick, side: "europe" | "usa"): number {
  const table = format === "singles" ? SCORING.singles : SCORING.foursomes;
  if (result === "half") return table.half;
  return result === side ? table.win : 0;
}

/** Cup points: a win is 1, a half is 0.5 for each side. */
export function cupFrom(matches: ScoredMatch[]): { europe: number; usa: number } {
  let europe = 0;
  let usa = 0;
  for (const match of matches) {
    if (match.result === "half") {
      europe += 0.5;
      usa += 0.5;
    } else if (match.result === "europe") {
      europe += 1;
    } else {
      usa += 1;
    }
  }
  return { europe, usa };
}

/** The cup score a set of match picks implies, for the exact-scoreline bonus. */
export function cupFromPicks(picks: Record<string, Pick>): { europe: number; usa: number } {
  let europe = 0;
  let usa = 0;
  for (const pick of Object.values(picks)) {
    if (pick === "half") {
      europe += 0.5;
      usa += 0.5;
    } else if (pick === "europe") {
      europe += 1;
    } else if (pick === "usa") {
      usa += 1;
    }
  }
  return { europe, usa };
}

/**
 * Card points. Deliberately mirrors the live simulator's rules so a name on the
 * leaderboard matches the number the live page shows:
 *  - appearance: +1 per completed match
 *  - win: 5 (foursomes/fourball) or 6 (singles); half: 2.5 or 3
 *  - the captain's match points are doubled
 *  - birdie +1, eagle +4, albatross +8
 *  - unbeaten across three or more matches, once the cup is complete: +5
 *  - Captain's Dozen totals are scaled by 0.9 so a twelve-man card sits on the
 *    same leaderboard as a six-man one
 */
export function scoreCard(card: CardInput, results: Results): CardScore {
  const scale = card.mode === "full" ? 0.9 : 1;
  const complete = results.total > 0 && results.finals === results.total;
  const rows = new Map<string, PlayerPoints>();
  for (const id of card.squad) {
    rows.set(id, {
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

  // Who wears the armband in a given session: the day's pick if the entry has
  // one (including an explicit "nobody"), otherwise the overall captain.
  const captainFor = (sessionId: string): string | null => {
    const day = sessionDay(sessionId);
    const dayPick = day ? card.sessionCaptains?.[day] : undefined;
    if (dayPick !== undefined) return dayPick ?? null;
    return card.captain ?? null;
  };
  let captainBonus = 0;

  for (const match of results.matches) {
    const armband = captainFor(match.sessionId);
    const sides: [string[], "europe" | "usa"][] = [
      [match.europe, "europe"],
      [match.usa, "usa"],
    ];
    for (const [ids, side] of sides) {
      for (const id of ids) {
        const row = rows.get(id);
        if (!row) continue;
        row.matches += 1;
        const value = matchValue(match.format, match.result, side);
        if (match.result === "half") row.halves += 1;
        else if (value > 0) row.wins += 1;
        else row.losses += 1;
        const doubled = Boolean(armband) && id === armband;
        const multiplier = doubled ? SCORING.captainMultiplier : 1;
        row.matchPoints += value * multiplier;
        if (doubled) captainBonus += value * (multiplier - 1);
        row.bonusPoints += SCORING.appearance;
      }
    }
    for (const event of match.events) {
      const row = rows.get(event.playerId);
      if (!row) continue;
      if (event.kind === "birdie") row.birdies += 1;
      else if (event.kind === "eagle") row.eagles += 1;
      else row.albatrosses += 1;
      row.bonusPoints += EVENT_POINTS[event.kind] ?? 0;
    }
  }

  const unbeaten: string[] = [];
  let total = 0;
  for (const row of rows.values()) {
    if (complete && row.matches >= 3 && row.losses === 0) {
      unbeaten.push(row.playerId);
      row.bonusPoints += SCORING.unbeatenBonus;
    }
    row.total = round((row.matchPoints + row.bonusPoints) * scale);
    total += row.total;
  }

  return {
    total: round(total),
    players: [...rows.values()],
    captainId: card.captain,
    sessionCaptains: card.sessionCaptains ?? {},
    captainBonus: round(captainBonus),
    unbeaten,
  };
}

/**
 * Predictor points: +2 per match called, +5 per award, +10 for the exact
 * scoreline. The exact bonus only lands once the cup is decided — mid-event the
 * partial totals could match by accident.
 */
export function scorePredictions(entry: PredictionInput, results: Results): PredictionScore {
  const picks = entry.predictions ?? {};
  let matchHits = 0;
  for (const match of results.matches) {
    if (picks[match.id] && picks[match.id] === match.result) matchHits += 1;
  }
  const matchPoints = matchHits * PREDICT_POINTS.match;

  const awardHits: string[] = [];
  const awards = (entry.awards ?? {}) as Record<string, string | null>;
  for (const key of ["mvp", "topScorer", "rookie"]) {
    const picked = awards[key];
    const actual = results.awards[key as keyof Awards];
    if (picked && actual && picked === actual) awardHits.push(key);
  }
  const awardPoints = awardHits.length * PREDICT_POINTS.award;

  const predictedCup = cupFromPicks(picks);
  const complete = results.total > 0 && results.finals === results.total;
  const exact =
    complete &&
    Object.keys(picks).length > 0 &&
    predictedCup.europe === results.cup.europe &&
    predictedCup.usa === results.cup.usa;
  const exactPoints = exact ? PREDICT_POINTS.exact : 0;

  return {
    total: round(matchPoints + awardPoints + exactPoints),
    matchHits,
    matchPoints,
    awardHits,
    awardPoints,
    exact,
    exactPoints,
    predictedCup,
    actualCup: results.cup,
  };
}

export function scoreEntry(
  card: CardInput,
  entry: PredictionInput,
  results: Results,
  transferPenalty = 0,
): EntryScore {
  const cardScore = scoreCard(card, results);
  const predictionScore = scorePredictions(entry, results);
  const gross = round(cardScore.total + predictionScore.total);
  const penalty = Math.max(0, round(transferPenalty));
  return {
    total: round(gross - penalty),
    gross,
    transferPenalty: penalty,
    card: cardScore,
    predictions: predictionScore,
  };
}

export type LeaderboardRow = {
  rank: number;
  entryId: string;
  team: string;
  manager: string;
  card: number;
  predictions: number;
  total: number;
  /** Points already deducted for extra transfers. */
  penalty?: number;
  prizeEligible: boolean;
  isYou?: boolean;
};

/** Standard competition ranking: equal scores share a rank, the next one skips. */
export function rankRows(rows: Omit<LeaderboardRow, "rank">[]): LeaderboardRow[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.team.localeCompare(b.team));
  let lastTotal: number | null = null;
  let lastRank = 0;
  return sorted.map((row, index) => {
    const rank = lastTotal !== null && row.total === lastTotal ? lastRank : index + 1;
    lastTotal = row.total;
    lastRank = rank;
    return { ...row, rank };
  });
}

/** Points are half-integers, so trim float noise before it reaches the UI. */
export function round(value: number): number {
  return Math.round(value * 10) / 10;
}
