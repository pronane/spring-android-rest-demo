/**
 * Deterministic match-play simulation.
 *
 * Same seed in, same tournament out — which keeps screenshots, demo links and
 * the predictor stable. The real product swaps this module for a live scoring
 * feed; everything downstream (fantasy points, league tables) already consumes
 * a `SimState`.
 */
import { PLAYERS, PLAYER_BY_ID, SCORING, type Side } from "./data";
import { MODES, type ModeId } from "./tournaments";

export type Pick = "europe" | "usa" | "half";
export type SessionFormat = "foursomes" | "fourball" | "singles";

export type SimSession = {
  id: string;
  day: string;
  label: string;
  format: SessionFormat;
  startMin: number;
  endMin: number;
  points: number;
};

/** Minutes from the first tee (Fri 07:35 IST). */
export const SESSIONS: SimSession[] = [
  { id: "fri-am", day: "Fri 17 Sep", label: "Foursomes", format: "foursomes", startMin: 0, endMin: 255, points: 4 },
  { id: "fri-pm", day: "Fri 17 Sep", label: "Fourball", format: "fourball", startMin: 300, endMin: 570, points: 4 },
  { id: "sat-am", day: "Sat 18 Sep", label: "Foursomes", format: "foursomes", startMin: 1440, endMin: 1695, points: 4 },
  { id: "sat-pm", day: "Sat 18 Sep", label: "Fourball", format: "fourball", startMin: 1740, endMin: 2010, points: 4 },
  { id: "sun", day: "Sun 19 Sep", label: "Singles", format: "singles", startMin: 2880, endMin: 3280, points: 12 },
];

export const SIM_END = 3300;
export const SIM_START = 0;

type Match = {
  id: string;
  no: number;
  sessionId: string;
  sessionIndex: number;
  format: SessionFormat;
  europe: string[];
  usa: string[];
  result: Pick;
  margin: string;
  finish: number;
  events: { playerId: string; hole: number; kind: "birdie" | "eagle" | "albatross" }[];
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bySide = (side: Side) =>
  [...PLAYERS].filter((p) => p.side === side).sort((a, b) => b.projected - a.projected);

const EU = bySide("europe");
const US = bySide("usa");

/** Partner rotations, deliberately different each session. */
const PAIRS: Record<string, { europe: [number, number][]; usa: [number, number][] }> = {
  "fri-am": {
    europe: [
      [0, 5],
      [1, 4],
      [2, 3],
      [6, 7],
    ],
    usa: [
      [0, 5],
      [1, 4],
      [2, 3],
      [6, 7],
    ],
  },
  "fri-pm": {
    europe: [
      [0, 2],
      [1, 3],
      [4, 6],
      [5, 8],
    ],
    usa: [
      [0, 3],
      [1, 2],
      [4, 6],
      [5, 7],
    ],
  },
  "sat-am": {
    europe: [
      [0, 4],
      [1, 6],
      [2, 7],
      [3, 5],
    ],
    usa: [
      [0, 4],
      [1, 6],
      [2, 8],
      [3, 5],
    ],
  },
  "sat-pm": {
    europe: [
      [0, 3],
      [1, 2],
      [4, 8],
      [6, 9],
    ],
    usa: [
      [0, 2],
      [1, 3],
      [4, 9],
      [6, 8],
    ],
  },
};

const singlesOpponent = (i: number) => (i * 5 + 3) % 12;

function buildMatches(seed: number): Match[] {
  const rnd = mulberry32(seed);
  const matches: Match[] = [];
  let no = 0;

  SESSIONS.forEach((session, sessionIndex) => {
    if (session.format === "singles") {
      for (let i = 0; i < 12; i += 1) {
        no += 1;
        matches.push(
          finishMatch({
            id: `${session.id}-${i + 1}`,
            no,
            sessionId: session.id,
            sessionIndex,
            format: "singles",
            europe: [EU[i].id],
            usa: [US[singlesOpponent(i)].id],
            rnd,
            finish: 0.8 + rnd() * 0.18,
          }),
        );
      }
      return;
    }

    const pairs = PAIRS[session.id];
    for (let i = 0; i < 4; i += 1) {
      no += 1;
      const e = pairs.europe[i];
      const u = pairs.usa[i];
      matches.push(
        finishMatch({
          id: `${session.id}-${i + 1}`,
          no,
          sessionId: session.id,
          sessionIndex,
          format: session.format,
          europe: e.map((idx) => EU[idx].id),
          usa: u.map((idx) => US[idx].id),
          rnd,
          finish: 0.78 + rnd() * 0.2,
        }),
      );
    }
  });

  return matches;
}

function finishMatch(input: {
  id: string;
  no: number;
  sessionId: string;
  sessionIndex: number;
  format: SessionFormat;
  europe: string[];
  usa: string[];
  rnd: () => number;
  finish: number;
}): Match {
  const { rnd } = input;
  const strength = (ids: string[]) =>
    ids.reduce((sum, id) => sum + PLAYER_BY_ID[id].projected, 0);

  const eStr = strength(input.europe) * (input.format === "singles" ? 1 : 0.82);
  const uStr = strength(input.usa) * (input.format === "singles" ? 1 : 0.82);
  const noise = (rnd() - 0.5) * 34;
  const diff = eStr - uStr + noise;

  let result: Pick;
  if (Math.abs(diff) < 11) result = "half";
  else result = diff > 0 ? "europe" : "usa";

  const spread = Math.abs(diff);
  const margin =
    result === "half"
      ? "AS"
      : spread > 38
        ? "5&4"
        : spread > 28
          ? "4&3"
          : spread > 18
            ? "3&2"
            : spread > 10
              ? "2&1"
              : "1up";

  const events: Match["events"] = [];
  const players = [...input.europe, ...input.usa];
  for (const playerId of players) {
    const used = new Set<number>();
    const birdies = Math.round(rnd() * 3.4);
    for (let b = 0; b < birdies; b += 1) {
      let hole = 1 + Math.floor(rnd() * 18);
      let guard = 0;
      while (used.has(hole) && guard < 20) {
        hole = 1 + Math.floor(rnd() * 18);
        guard += 1;
      }
      used.add(hole);
      events.push({ playerId, hole, kind: "birdie" });
    }
    if (rnd() > 0.93) {
      let hole = 2 + Math.floor(rnd() * 16);
      let guard = 0;
      while (used.has(hole) && guard < 20) {
        hole = 2 + Math.floor(rnd() * 16);
        guard += 1;
      }
      used.add(hole);
      events.push({ playerId, hole, kind: "eagle" });
    }
  }

  return { ...input, result, margin, events };
}

const CACHE = new Map<number, Match[]>();

export function matchesFor(seed: number = 2027): Match[] {
  if (!CACHE.has(seed)) CACHE.set(seed, buildMatches(seed));
  return CACHE.get(seed)!;
}

/** Pairings without results — used by the match predictor. */
export function pairingsFor(seed: number = 2027) {
  return matchesFor(seed).map((m) => ({
    id: m.id,
    no: m.no,
    sessionId: m.sessionId,
    sessionIndex: m.sessionIndex,
    format: m.format,
    europe: m.europe,
    usa: m.usa,
  }));
}

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));

function clockFor(minute: number) {
  if (minute < 0) return "Fri 17 Sep · 07:00 IST";
  const dayIndex = minute >= 2880 ? 2 : minute >= 1440 ? 1 : 0;
  const dayStart = dayIndex * 1440;
  const minutesIntoDay = 7 * 60 + 35 + (minute - dayStart);
  const hh = Math.floor(minutesIntoDay / 60) % 24;
  const mm = minutesIntoDay % 60;
  const day = ["Fri 17 Sep", "Sat 18 Sep", "Sun 19 Sep"][dayIndex];
  return `${day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} IST`;
}

export type LiveMatch = {
  id: string;
  no: number;
  sessionId: string;
  sessionIndex: number;
  format: SessionFormat;
  europe: string[];
  usa: string[];
  result: Pick;
  margin: string;
  status: "scheduled" | "live" | "final";
  holesPlayed: number;
  leader: Pick | null;
  liveEvents: { playerId: string; hole: number; kind: "birdie" | "eagle" | "albatross" }[];
};

export type SimState = {
  minute: number;
  clock: string;
  phase: "pre" | "live" | "done";
  sessionIndex: number;
  session: SimSession | null;
  sessionProgress: number;
  heading: string;
  matches: LiveMatch[];
  cup: { europe: number; usa: number; remaining: number; inPlay: number };
  completed: number;
  feed: { minute: number; text: string; side: Side }[];
};

export function simState(minute: number, seed: number = 2027): SimState {
  const matches = matchesFor(seed);
  let activeIndex = -1;
  SESSIONS.forEach((session, index) => {
    if (minute >= session.startMin) activeIndex = index;
  });
  const session = activeIndex >= 0 ? SESSIONS[activeIndex] : null;
  const sessionProgress = session
    ? clamp((minute - session.startMin) / (session.endMin - session.startMin))
    : 0;

  const live: LiveMatch[] = matches.map((match) => {
    const s = SESSIONS[match.sessionIndex];
    if (minute < s.startMin) {
      return {
        ...match,
        status: "scheduled" as const,
        holesPlayed: 0,
        leader: null,
        liveEvents: [],
      };
    }
    const raw = (minute - s.startMin) / (s.endMin - s.startMin);
    const progress = clamp(raw / match.finish);
    const holesPlayed = progress >= 1 ? 18 : Math.floor(progress * 18);
    const status = progress >= 1 ? ("final" as const) : ("live" as const);
    const liveEvents = match.events.filter((e) => e.hole <= holesPlayed);
    // Before the turn a match is level; "up" only appears once someone leads.
    const leader =
      status === "final"
        ? match.result
        : holesPlayed > 6 && match.result !== "half"
          ? match.result
          : null;
    return { ...match, status, holesPlayed, leader, liveEvents };
  });

  const finals = live.filter((m) => m.status === "final");
  const halves = finals.filter((m) => m.result === "half").length;
  const europe = finals.filter((m) => m.result === "europe").length + halves * 0.5;
  const usa = finals.filter((m) => m.result === "usa").length + halves * 0.5;
  const inPlay = live.filter((m) => m.status === "live").length;

  const feed = finals
    .flatMap((m) =>
      m.liveEvents.map((e) => ({
        minute: SESSIONS[m.sessionIndex].startMin + 40 + e.hole * 12,
        text: `Hole ${e.hole} · ${PLAYER_BY_ID[e.playerId].shortName} ${e.kind}`,
        side: PLAYER_BY_ID[e.playerId].side,
      })),
    )
    .sort((a, b) => b.minute - a.minute || a.text.localeCompare(b.text))
    .filter((event, index, all) => all.findIndex((e) => e.text === event.text) === index)
    .slice(0, 9);

  const phase = minute >= SESSIONS[SESSIONS.length - 1].endMin ? "done" : minute > 0 ? "live" : "pre";

  return {
    minute,
    clock: clockFor(minute),
    phase,
    sessionIndex: activeIndex,
    session,
    sessionProgress,
    heading: session
      ? `${session.day} · ${session.label}`
      : "Friday · first tee 07:35",
    matches: live,
    cup: {
      europe,
      usa,
      remaining: 28 - finals.length,
      inPlay,
    },
    completed: finals.length,
    feed,
  };
}

/* ——— Fantasy scoring against the simulation ——— */

export type PlayerScore = {
  playerId: string;
  matches: number;
  wins: number;
  halves: number;
  losses: number;
  birdies: number;
  eagles: number;
  matchPoints: number;
  bonusPoints: number;
  total: number;
  inPlay: number;
};

export type SquadScore = {
  total: number;
  players: PlayerScore[];
  captainId: string | null;
  unbeaten: string[];
};

export function scoreSquad(
  squad: string[],
  captain: string | null,
  mode: ModeId,
  state: SimState,
): SquadScore {
  const cfg = MODES[mode] ?? MODES.classic;
  const scale = cfg.squadSize === 12 ? 0.9 : 1;
  const rows = new Map<string, PlayerScore>();

  for (const id of squad) {
    rows.set(id, {
      playerId: id,
      matches: 0,
      wins: 0,
      halves: 0,
      losses: 0,
      birdies: 0,
      eagles: 0,
      matchPoints: 0,
      bonusPoints: 0,
      total: 0,
      inPlay: 0,
    });
  }

  for (const match of state.matches) {
    const inMatch = [...match.europe, ...match.usa].filter((id) => rows.has(id));
    if (match.status === "scheduled") continue;
    if (match.status === "live") {
      for (const id of inMatch) rows.get(id)!.inPlay += 1;
      continue;
    }
    const sideOf = new Map<string, Side>();
    match.europe.forEach((id) => sideOf.set(id, "europe"));
    match.usa.forEach((id) => sideOf.set(id, "usa"));

    for (const id of inMatch) {
      const row = rows.get(id)!;
      const side = sideOf.get(id)!;
      const won =
        match.result === "half" ? false : match.result === side;
      const halved = match.result === "half";

      row.matches += 1;
      row.wins += won ? 1 : 0;
      row.halves += halved ? 1 : 0;
      row.losses += !won && !halved ? 1 : 0;

      const table =
        match.format === "singles" ? SCORING.singles : SCORING.foursomes;
      const matchPoints = won ? table.win : halved ? table.half : 0;
      const multiplier = id === captain ? SCORING.captainMultiplier : 1;
      row.matchPoints += matchPoints * multiplier;
      row.bonusPoints += SCORING.appearance;

      for (const event of match.liveEvents) {
        if (event.playerId !== id) continue;
        row.birdies += event.kind === "birdie" ? 1 : 0;
        row.eagles += event.kind === "eagle" ? 1 : 0;
        row.bonusPoints +=
          event.kind === "birdie"
            ? SCORING.birdie
            : event.kind === "eagle"
              ? SCORING.eagle
              : SCORING.albatross;
      }
    }
  }

  const unbeaten: string[] = [];
  const allDone = state.completed >= 28;
  for (const row of rows.values()) {
    if (allDone && row.matches >= 3 && row.losses === 0) {
      row.bonusPoints += SCORING.unbeatenBonus;
      unbeaten.push(row.playerId);
    }
    row.total = Number(((row.matchPoints + row.bonusPoints) * scale).toFixed(1));
  }

  const players = [...rows.values()].sort((a, b) => b.total - a.total);
  const total = Number(players.reduce((sum, p) => sum + p.total, 0).toFixed(1));
  return { total, players, captainId: captain, unbeaten };
}

/** Deterministic rival scores so league tables move as the cup progresses. */
export function rivalProgress(
  seedPoints: number,
  state: SimState,
  seed: number,
): number {
  const progress = Math.min(1, (state.minute + 60) / SIM_END);
  const wobble = mulberry32(seed)() * 18 - 9;
  return Number((seedPoints * (0.28 + progress * 0.72) + wobble * progress).toFixed(1));
}

export const SIM_MARKERS = [
  { label: "Fri foursomes", minute: 150 },
  { label: "Sat fourball", minute: 1880 },
  { label: "Sunday singles", minute: 3080 },
];
