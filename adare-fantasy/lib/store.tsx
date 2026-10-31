"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_SQUAD, LEAGUES, PLAYER_BY_ID, PLAYERS, type League, type Player } from "./data";
import {
  autoPick,
  modeConfig,
  projectedOf,
  sideCount,
  spendOf,
  validateSquad,
} from "./helpers";
import { ACTIVE_EDITION_ID, MODES, type ModeId } from "./tournaments";
import type { Pick } from "./sim";
import type { PinpointGuess } from "./pinpoint";

const STORAGE_KEY = "twentyeight:v2";

export type Awards = {
  mvp: string | null;
  topScorer: string | null;
  rookie: string | null;
};

export type Entry = {
  paid: boolean;
  plan: string | null;
  ref: string | null;
  amount: number;
  paidAt: string | null;
};

export type TeamState = {
  editionId: string;
  manager: string;
  teamName: string;
  squad: string[];
  captain: string | null;
  mode: ModeId;
  predictions: Record<string, Pick>;
  awards: Awards;
  pinpoint: Record<string, PinpointGuess>;
  entry: Entry;
  joinedLeagues: string[];
  customLeagues: League[];
  updatedAt: string | null;
  isDemo: boolean;
};

const DEMO_PREDICTIONS: Record<string, Pick> = {
  "fri-am-1": "europe",
  "fri-am-2": "usa",
  "fri-am-3": "half",
  "fri-am-4": "europe",
  "fri-pm-1": "europe",
  "fri-pm-2": "europe",
  "fri-pm-3": "usa",
  "fri-pm-4": "half",
  "sat-am-1": "usa",
  "sat-am-2": "europe",
};

const DEMO_STATE: TeamState = {
  editionId: ACTIVE_EDITION_ID,
  manager: "Séamus Ryan",
  teamName: "Bogey Merchants",
  squad: DEMO_SQUAD,
  captain: "rory",
  mode: "classic",
  predictions: DEMO_PREDICTIONS,
  awards: { mvp: "rory", topScorer: "scheffler", rookie: "rasmus" },
  pinpoint: {},
  // The demo card is a preview only. It used to carry a paid entry, so every
  // first-time visitor saw "My card", a receipt on /enter and an unlocked Save
  // button without ever paying.
  entry: { paid: false, plan: null, ref: null, amount: 0, paidAt: null },
  joinedLeagues: ["portrush-pints", "nineteenth-hole"],
  customLeagues: [],
  updatedAt: "2026-10-24T09:12:00.000Z",
  isDemo: true,
};

const EMPTY_STATE: TeamState = {
  editionId: ACTIVE_EDITION_ID,
  manager: "",
  teamName: "",
  squad: [],
  captain: null,
  mode: "classic",
  predictions: {},
  awards: { mvp: null, topScorer: null, rookie: null },
  pinpoint: {},
  entry: { paid: false, plan: null, ref: null, amount: 0, paidAt: null },
  joinedLeagues: [],
  customLeagues: [],
  updatedAt: null,
  isDemo: false,
};

type FantasyContextValue = {
  state: TeamState;
  ready: boolean;
  players: Player[];
  mode: (typeof MODES)[ModeId];
  spend: number;
  remaining: number;
  projected: number;
  leagues: League[];
  errors: string[];
  isSaved: boolean;
  paid: boolean;
  setMode: (mode: ModeId) => void;
  togglePlayer: (id: string) => void;
  setCaptain: (id: string | null) => void;
  setIdentity: (manager: string, teamName: string) => void;
  saveTeam: () => void;
  autoFill: () => void;
  joinLeague: (code: string) => { ok: boolean; message: string };
  createLeague: (name: string, buyIn?: number) => League;
  leaveLeague: (id: string) => void;
  resetTeam: () => void;
  loadDemo: () => void;
  clearSquad: () => void;
  setPrediction: (matchId: string, pick: Pick) => void;
  clearPredictions: () => void;
  setAward: (key: keyof Awards, playerId: string | null) => void;
  setPinpoint: (dayId: string, guess: PinpointGuess) => void;
  setEntry: (entry: Partial<Entry>) => void;
  hydrate: (partial: Partial<TeamState>) => void;
};

const FantasyContext = createContext<FantasyContextValue | null>(null);

/** The old demo card shipped a fake paid receipt. Drop that reference only. */
const LEGACY_DEMO_REF = "TE-8F42-ADRE";

function normalise(raw: Partial<TeamState> | null): TeamState {
  if (!raw) return DEMO_STATE;
  const mode: ModeId = raw.mode === "full" ? "full" : "classic";
  const storedEntry =
    raw.entry?.ref === LEGACY_DEMO_REF
      ? EMPTY_STATE.entry
      : { ...EMPTY_STATE.entry, ...(raw.entry ?? {}) };
  const squad = Array.isArray(raw.squad)
    ? [...new Set(raw.squad.filter((id) => PLAYER_BY_ID[id]))].slice(0, MODES[mode].squadSize)
    : [];
  return {
    ...EMPTY_STATE,
    ...raw,
    mode,
    captain: raw.captain && squad.includes(raw.captain) ? raw.captain : null,
    predictions: raw.predictions && typeof raw.predictions === "object" ? raw.predictions : {},
    awards: { ...EMPTY_STATE.awards, ...(raw.awards ?? {}) },
    pinpoint: raw.pinpoint && typeof raw.pinpoint === "object" ? raw.pinpoint : {},
    // A paid entry always wins over the demo flag: paying on the demo card is a
    // real purchase and must survive a reload (it used to be wiped).
    entry: storedEntry,
    isDemo: Boolean(raw.isDemo) && !storedEntry.paid,
    squad,
    joinedLeagues: Array.isArray(raw.joinedLeagues) ? raw.joinedLeagues : [],
    customLeagues: Array.isArray(raw.customLeagues) ? raw.customLeagues : [],
  };
}

function readStored(): TeamState {
  if (typeof window === "undefined") return DEMO_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEMO_STATE;
    return normalise(JSON.parse(raw) as Partial<TeamState>);
  } catch {
    return DEMO_STATE;
  }
}

export function FantasyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TeamState>(DEMO_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readStored());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable — the demo still works in memory */
    }
  }, [state, ready]);

  const setMode = useCallback((mode: ModeId) => {
    setState((prev) => {
      if (prev.mode === mode) return prev;
      // Budgets and squad sizes differ, so a mode switch starts a fresh card.
      return { ...prev, mode, squad: [], captain: null, isDemo: false };
    });
  }, []);

  const togglePlayer = useCallback((id: string) => {
    setState((prev) => {
      const cfg = MODES[prev.mode];
      const inSquad = prev.squad.includes(id);
      if (inSquad) {
        return {
          ...prev,
          squad: prev.squad.filter((x) => x !== id),
          captain: prev.captain === id ? null : prev.captain,
          isDemo: false,
        };
      }
      const player = PLAYER_BY_ID[id];
      if (!player) return prev;
      if (prev.squad.length >= cfg.squadSize) return prev;
      if (sideCount(prev.squad, player.side) >= cfg.maxPerSide) return prev;
      if (spendOf(prev.squad) + player.price > cfg.budget) return prev;
      return { ...prev, squad: [...prev.squad, id], isDemo: false };
    });
  }, []);

  const setCaptain = useCallback((id: string | null) => {
    setState((prev) =>
      id === null || prev.squad.includes(id) ? { ...prev, captain: id, isDemo: false } : prev,
    );
  }, []);

  const setIdentity = useCallback((manager: string, teamName: string) => {
    setState((prev) => ({ ...prev, manager, teamName }));
  }, []);

  const saveTeam = useCallback(() => {
    setState((prev) => ({ ...prev, isDemo: false, updatedAt: new Date().toISOString() }));
  }, []);

  const autoFill = useCallback(() => {
    setState((prev) => {
      const { squad, captain } = autoPick(prev.mode);
      return { ...prev, squad, captain, isDemo: false };
    });
  }, []);

  const joinLeague = useCallback(
    (code: string) => {
      const cleaned = code.trim().toUpperCase();
      const existing = [...LEAGUES, ...state.customLeagues].find(
        (l) => l.code === cleaned || l.id === cleaned.toLowerCase(),
      );
      if (!existing) {
        return { ok: false, message: `No league found for “${cleaned}”. Try ADARE7.` };
      }
      if (state.joinedLeagues.includes(existing.id)) {
        return { ok: false, message: `You are already in ${existing.name}.` };
      }
      setState((prev) => ({
        ...prev,
        joinedLeagues: [...prev.joinedLeagues, existing.id],
      }));
      return { ok: true, message: `Joined ${existing.name}. Good luck.` };
    },
    [state.customLeagues, state.joinedLeagues],
  );

  const createLeague = useCallback(
    (name: string, buyIn = 0) => {
      // Codes must be unique, or "join by code" lands people in the wrong league.
      const taken = new Set([...LEAGUES, ...state.customLeagues].map((l) => l.code));
      const stem = (name.replace(/[^a-zA-Z]/g, "").toUpperCase() || "LEAGUE").slice(0, 4);
      let code = `${stem}27`.padEnd(6, "X");
      while (taken.has(code)) {
        code = `${stem.slice(0, 3)}${Math.floor(Math.random() * 900 + 100)}`;
      }
      const league: League = {
        id: `custom-${Date.now()}`,
        name: name.trim() || "New league",
        code,
        visibility: "private",
        blurb: "Your new private league. Share the code — the table fills up as mates join.",
        buyIn,
        prizePool: buyIn * 8,
        members: [
          {
            manager: state.manager || "You",
            team: state.teamName || "Your team",
            points: projectedOf(state.squad, state.captain, state.mode),
            isYou: true,
          },
        ],
      };
      setState((prev) => ({
        ...prev,
        customLeagues: [...prev.customLeagues, league],
        joinedLeagues: [...prev.joinedLeagues, league.id],
      }));
      return league;
    },
    [state.captain, state.customLeagues, state.manager, state.mode, state.squad, state.teamName],
  );

  const leaveLeague = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      joinedLeagues: prev.joinedLeagues.filter((x) => x !== id),
    }));
  }, []);

  const resetTeam = useCallback(() => {
    setState({ ...EMPTY_STATE, customLeagues: [] });
  }, []);

  const loadDemo = useCallback(() => {
    // Keep a real paid entry if there is one — loading the demo shouldn't lose it.
    setState((prev) => ({ ...DEMO_STATE, entry: prev.entry, updatedAt: new Date().toISOString() }));
  }, []);

  const clearSquad = useCallback(() => {
    setState((prev) => ({ ...prev, squad: [], captain: null, isDemo: false }));
  }, []);

  const setPrediction = useCallback((matchId: string, pick: Pick) => {
    setState((prev) => ({
      ...prev,
      predictions: { ...prev.predictions, [matchId]: pick },
      isDemo: false,
    }));
  }, []);

  const clearPredictions = useCallback(() => {
    setState((prev) => ({ ...prev, predictions: {} }));
  }, []);

  const setAward = useCallback((key: keyof Awards, playerId: string | null) => {
    setState((prev) => ({
      ...prev,
      awards: { ...prev.awards, [key]: playerId },
    }));
  }, []);

  const setPinpoint = useCallback((dayId: string, guess: PinpointGuess) => {
    setState((prev) => ({ ...prev, pinpoint: { ...prev.pinpoint, [dayId]: guess } }));
  }, []);

  const setEntry = useCallback((entry: Partial<Entry>) => {
    setState((prev) => ({
      ...prev,
      entry: { ...prev.entry, ...entry },
      isDemo: entry.paid ? false : prev.isDemo,
    }));
  }, []);

  const hydrate = useCallback((partial: Partial<TeamState>) => {
    setState((prev) => normalise({ ...prev, ...partial }));
  }, []);

  const leagues = useMemo(() => [...LEAGUES, ...state.customLeagues], [state.customLeagues]);

  const cfg = MODES[state.mode];
  const spend = spendOf(state.squad);
  const projected = projectedOf(state.squad, state.captain, state.mode);
  const errors = useMemo(() => validateSquad(state.squad, state.mode), [state.squad, state.mode]);

  return (
    <FantasyContext.Provider
      value={{
        state,
        ready,
        players: PLAYERS,
        mode: cfg,
        spend,
        remaining: cfg.budget - spend,
        projected,
        leagues,
        errors,
        isSaved: state.updatedAt !== null && !state.isDemo,
        paid: state.entry.paid,
        setMode,
        togglePlayer,
        setCaptain,
        setIdentity,
        saveTeam,
        autoFill,
        joinLeague,
        createLeague,
        leaveLeague,
        resetTeam,
        loadDemo,
        clearSquad,
        setPrediction,
        clearPredictions,
        setAward,
        setPinpoint,
        setEntry,
        hydrate,
      }}
    >
      {children}
    </FantasyContext.Provider>
  );
}

export function useFantasy(): FantasyContextValue {
  const ctx = useContext(FantasyContext);
  if (!ctx) throw new Error("useFantasy must be used inside <FantasyProvider>");
  return ctx;
}
