/**
 * Live scoring adapter.
 *
 * The live page and fantasy scoring both consume a `SimState`. Until a real
 * feed exists that state comes from the deterministic simulation; once
 * `LIVE_FEED_URL` is set, `/api/live` returns a `LiveFeed` and `applyFeed`
 * overlays the real match states onto the same shape — so nothing downstream
 * (cup score, squad points, league tables) needs to know where the data came
 * from.
 *
 * Feed format (JSON, any provider can be mapped to it):
 * {
 *   "updatedAt": "2027-09-19T15:04:00+01:00",
 *   "matches": [
 *     { "id": "sun-3", "status": "live", "holesPlayed": 11, "leader": "europe",
 *       "margin": "2 UP", "europe": ["rory"], "usa": ["scheffler"],
 *       "events": [{ "playerId": "rory", "hole": 9, "kind": "birdie" }] }
 *   ]
 * }
 * Match ids follow the predictor: fri-am-1…4, fri-pm-1…4, sat-am-1…4,
 * sat-pm-1…4, sun-1…12. Unknown ids and player ids are ignored.
 */
import { PLAYER_BY_ID } from "./data";
import { SESSIONS, type LiveMatch, type Pick, type SimState } from "./sim";

export type FeedEvent = { playerId: string; hole: number; kind: "birdie" | "eagle" | "albatross" };

export type FeedMatch = {
  id: string;
  status: "scheduled" | "live" | "final";
  holesPlayed?: number;
  /** Who is ahead right now (null = all square). */
  leader?: Pick | null;
  /** Final result; required when status is "final". */
  result?: Pick;
  margin?: string;
  europe?: string[];
  usa?: string[];
  events?: FeedEvent[];
};

export type LiveFeed = { updatedAt: string; matches: FeedMatch[] };

const PICKS = new Set(["europe", "usa", "half"]);
const STATUSES = new Set(["scheduled", "live", "final"]);
const KINDS = new Set(["birdie", "eagle", "albatross"]);

/** Validates untrusted feed JSON, dropping anything malformed. */
export function parseFeed(raw: unknown): LiveFeed | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { updatedAt?: unknown; matches?: unknown };
  if (!Array.isArray(body.matches)) return null;
  const knownIds = (ids: unknown) =>
    Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string" && Boolean(PLAYER_BY_ID[id]))
      : undefined;

  const matches: FeedMatch[] = [];
  for (const item of body.matches) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== "string" || typeof m.status !== "string" || !STATUSES.has(m.status)) continue;
    const status = m.status as FeedMatch["status"];
    const result = typeof m.result === "string" && PICKS.has(m.result) ? (m.result as Pick) : undefined;
    if (status === "final" && !result) continue;
    const holes = Number(m.holesPlayed);
    matches.push({
      id: m.id,
      status,
      holesPlayed: Number.isFinite(holes) ? Math.max(0, Math.min(18, Math.trunc(holes))) : undefined,
      leader:
        m.leader === null ? null : typeof m.leader === "string" && PICKS.has(m.leader) ? (m.leader as Pick) : undefined,
      result,
      margin: typeof m.margin === "string" ? m.margin.slice(0, 12) : undefined,
      europe: knownIds(m.europe),
      usa: knownIds(m.usa),
      events: Array.isArray(m.events)
        ? m.events.flatMap((e): FeedEvent[] => {
            if (!e || typeof e !== "object") return [];
            const ev = e as Record<string, unknown>;
            const hole = Number(ev.hole);
            if (
              typeof ev.playerId !== "string" ||
              !PLAYER_BY_ID[ev.playerId] ||
              typeof ev.kind !== "string" ||
              !KINDS.has(ev.kind) ||
              !Number.isInteger(hole) ||
              hole < 1 ||
              hole > 18
            ) {
              return [];
            }
            return [{ playerId: ev.playerId, hole, kind: ev.kind as FeedEvent["kind"] }];
          })
        : undefined,
    });
  }
  const updatedAt = typeof body.updatedAt === "string" ? body.updatedAt : new Date().toISOString();
  return { updatedAt, matches };
}

/** Overlays real match states onto a base state (normally `simState(0)`). */
export function applyFeed(base: SimState, feed: LiveFeed): SimState {
  const byId = new Map(feed.matches.map((m) => [m.id, m]));

  const matches: LiveMatch[] = base.matches.map((match) => {
    const real = byId.get(match.id);
    if (!real) {
      return { ...match, status: "scheduled", holesPlayed: 0, leader: null, liveEvents: [] };
    }
    const europe = real.europe?.length ? real.europe : match.europe;
    const usa = real.usa?.length ? real.usa : match.usa;
    const holesPlayed =
      real.status === "final" ? real.holesPlayed ?? 18 : real.status === "live" ? real.holesPlayed ?? 0 : 0;
    const result: Pick = real.result ?? "half";
    return {
      ...match,
      europe,
      usa,
      status: real.status,
      holesPlayed,
      result,
      margin: real.margin ?? (real.status === "final" ? (result === "half" ? "AS" : "") : ""),
      leader: real.status === "final" ? result : real.leader ?? null,
      liveEvents: real.events ?? [],
    };
  });

  const finals = matches.filter((m) => m.status === "final");
  const halves = finals.filter((m) => m.result === "half").length;
  const europe = finals.filter((m) => m.result === "europe").length + halves * 0.5;
  const usa = finals.filter((m) => m.result === "usa").length + halves * 0.5;
  const inPlay = matches.filter((m) => m.status === "live").length;

  // The current session is the latest one with any match under way.
  let sessionIndex = -1;
  matches.forEach((m) => {
    if (m.status !== "scheduled") sessionIndex = Math.max(sessionIndex, m.sessionIndex);
  });
  const session = sessionIndex >= 0 ? SESSIONS[sessionIndex] : null;
  const sessionMatches = matches.filter((m) => m.sessionIndex === sessionIndex);
  const sessionProgress = sessionMatches.length
    ? sessionMatches.reduce((sum, m) => sum + m.holesPlayed, 0) / (sessionMatches.length * 18)
    : 0;

  const allFinal = finals.length === matches.length;
  const updated = new Date(feed.updatedAt);
  const clock = Number.isNaN(updated.getTime())
    ? "Live feed"
    : `Live feed · updated ${updated.toLocaleTimeString("en-IE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Dublin",
      })} IST`;

  const feedLines = matches
    .flatMap((m) =>
      m.liveEvents.map((e) => ({
        minute: SESSIONS[m.sessionIndex].startMin + e.hole * 12,
        text: `Hole ${e.hole} · ${PLAYER_BY_ID[e.playerId]?.shortName ?? e.playerId} ${e.kind}`,
        side: PLAYER_BY_ID[e.playerId]?.side ?? "europe",
      })),
    )
    .sort((a, b) => b.minute - a.minute)
    .slice(0, 9);

  return {
    ...base,
    minute: session ? session.startMin : 0,
    clock,
    phase: allFinal ? "done" : sessionIndex >= 0 ? "live" : "pre",
    sessionIndex,
    session,
    sessionProgress,
    heading: session ? `${session.day} · ${session.label}` : "Friday · first tee 07:35",
    matches,
    cup: { europe, usa, remaining: matches.length - finals.length, inPlay },
    completed: finals.length,
    feed: feedLines,
  };
}
