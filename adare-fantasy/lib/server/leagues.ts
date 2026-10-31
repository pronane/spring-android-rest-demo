import { projectedOf } from "@/lib/helpers";
import type { ServerLeague, User } from "./db";

export type LeagueRow = {
  userId: string;
  manager: string;
  team: string;
  points: number;
  isYou: boolean;
  prizeEntry: boolean;
};

export type LeagueView = {
  id: string;
  name: string;
  code: string;
  buyIn: number;
  isOwner: boolean;
  rows: LeagueRow[];
};

/** A member's points: projected from their saved card until live scoring is wired in. */
function rowFor(user: User, me: string): LeagueRow {
  const entry = user.entry;
  const points = entry?.squad?.length
    ? projectedOf(entry.squad, entry.captain ?? null, entry.mode ?? "classic")
    : 0;
  return {
    userId: user.id,
    manager: user.manager,
    team: user.teamName,
    points: Math.round(points * 10) / 10,
    isYou: user.id === me,
    prizeEntry: entry?.prizeEligible ?? (entry?.amount ?? 0) > 0,
  };
}

export function toView(league: ServerLeague, members: User[], me: string): LeagueView {
  return {
    id: league.id,
    name: league.name,
    code: league.code,
    buyIn: league.buyIn,
    isOwner: league.ownerId === me,
    rows: members.map((m) => rowFor(m, me)).sort((a, b) => b.points - a.points),
  };
}
