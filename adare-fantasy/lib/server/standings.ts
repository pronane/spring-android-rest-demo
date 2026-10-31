/**
 * Leaderboards, built from stored entries and the current results snapshot.
 *
 * Scoring happens on the server so a browser cannot claim a score, and the same
 * function powers the global table, a private league's table and the breakdown
 * on the account page.
 */
import { penaltyFor } from "@/lib/transfers";
import { scoreEntry, rankRows, type LeaderboardRow, type Results } from "@/lib/scoring";
import type { ModeId } from "@/lib/tournaments";
import { listUsers, listLeaguesFor, findLeague, findUser, type User } from "./db";
import { getResults } from "./results";

export type StandingRow = LeaderboardRow;

export type ResultsMeta = {
  source: Results["source"];
  updatedAt: string;
  finals: number;
  total: number;
  cup: { europe: number; usa: number };
  /** Where the weekend had got to: only finished matches are scored. */
  minute: number;
  phase: "pre" | "live" | "done";
  inPlay: number;
  provisional: boolean;
  clock: string;
};

export type Standings = {
  rows: StandingRow[];
  you: StandingRow | null;
  results: ResultsMeta;
  scope: { kind: "global" | "league"; id?: string; name?: string };
  total: number;
};

const hasCard = (user: User) => Boolean(user.entry?.squad?.length && user.entry.ref);

function scoreUser(user: User, results: Results, me: string | null): Omit<StandingRow, "rank"> | null {
  const entry = user.entry;
  if (!entry || !entry.squad?.length) return null;
  const scored = scoreEntry(
    {
      squad: entry.squad,
      captain: entry.captain ?? null,
      mode: (entry.mode ?? "classic") as ModeId,
      sessionCaptains: entry.sessionCaptains ?? undefined,
    },
    { predictions: (entry.predictions ?? {}) as never, awards: entry.awards ?? undefined },
    results,
    penaltyFor(entry.transfers),
  );
  return {
    entryId: user.id,
    team: user.teamName,
    manager: user.manager,
    card: scored.card.total,
    predictions: scored.predictions.total,
    total: scored.total,
    penalty: scored.transferPenalty,
    prizeEligible: entry.prizeEligible ?? entry.amount > 0,
    isYou: user.id === me,
  };
}

function metaOf(results: Results): ResultsMeta {
  return {
    source: results.source,
    updatedAt: results.updatedAt,
    finals: results.finals,
    total: results.total,
    cup: results.cup,
    minute: results.minute ?? 0,
    phase: results.phase ?? (results.finals >= results.total ? "done" : "live"),
    inPlay: results.inPlay ?? 0,
    provisional: results.provisional ?? results.finals < results.total,
    clock: results.clock ?? "All 28 matches in the books",
  };
}

export async function getStandings(
  options: { leagueId?: string; me?: string | null; limit?: number; at?: number } = {},
): Promise<Standings> {
  const results = await getResults({ minute: options.at });
  const me = options.me ?? null;
  let users: User[];
  let scope: Standings["scope"] = { kind: "global" };

  if (options.leagueId) {
    const meUser = me ? await findUser(me) : null;
    if (!meUser) {
      // No viewer: an operator asking for a league table (prize settlement) gets
      // the league's members rather than an empty board.
      const found = await findLeague(options.leagueId);
      users = found?.members ?? [];
      scope = { kind: "league", id: options.leagueId, name: found?.league.name };
    } else {
      const leagues = await listLeaguesFor(meUser.id);
      const found = leagues.find((row) => row.league.id === options.leagueId);
      users = found?.members ?? [];
      scope = { kind: "league", id: options.leagueId, name: found?.league.name };
      if (!found) users = [];
    }
  } else {
    users = (await listUsers()).filter(hasCard);
  }

  const scored = users
    .map((user) => scoreUser(user, results, me))
    .filter((row): row is Omit<StandingRow, "rank"> => row !== null);
  const ranked = rankRows(scored);
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 500) : ranked.length;

  return {
    rows: ranked.slice(0, limit),
    you: ranked.find((row) => row.isYou) ?? null,
    results: metaOf(results),
    scope,
    total: ranked.length,
  };
}

/** One entry's full breakdown, for the account page. */
export async function getBreakdown(userId: string, options: { at?: number } = {}) {
  const user = await findUser(userId);
  const entry = user?.entry;
  if (!user || !entry?.squad?.length) return null;
  const results = await getResults({ minute: options.at });
  const scored = scoreEntry(
    {
      squad: entry.squad,
      captain: entry.captain ?? null,
      mode: (entry.mode ?? "classic") as ModeId,
      sessionCaptains: entry.sessionCaptains ?? undefined,
    },
    { predictions: (entry.predictions ?? {}) as never, awards: entry.awards ?? undefined },
    results,
    penaltyFor(entry.transfers),
  );
  return {
    entry: {
      ref: entry.ref,
      team: user.teamName,
      manager: user.manager,
      prizeEligible: entry.prizeEligible ?? entry.amount > 0,
      transfers: entry.transfers ?? [],
      bonusTransfers: entry.bonusTransfers ?? 0,
    },
    score: scored,
    results: { ...metaOf(results), awards: results.awards },
  };
}
