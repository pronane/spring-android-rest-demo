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
import { BUDGET, DEMO_SQUAD, LEAGUES, MAX_PER_SIDE, PLAYERS, PLAYER_BY_ID, SQUAD_SIZE, type League, type Player } from "./data";
import { autoPick, projectedOf, sideCount, spendOf, validateSquad } from "./helpers";

const STORAGE_KEY = "adare-fantasy:v1";

export type TeamState = {
  manager: string;
  teamName: string;
  squad: string[];
  captain: string | null;
  joinedLeagues: string[];
  customLeagues: League[];
  updatedAt: string | null;
  isDemo: boolean;
};

const DEMO_STATE: TeamState = {
  manager: "Séamus Ryan",
  teamName: "Bogey Merchants",
  squad: DEMO_SQUAD,
  captain: "rory",
  joinedLeagues: ["portrush-pints", "nineteenth-hole"],
  customLeagues: [],
  updatedAt: "2026-10-24T09:12:00.000Z",
  isDemo: true,
};

const EMPTY_STATE: TeamState = {
  manager: "",
  teamName: "",
  squad: [],
  captain: null,
  joinedLeagues: [],
  customLeagues: [],
  updatedAt: null,
  isDemo: false,
};

type FantasyContextValue = {
  state: TeamState;
  ready: boolean;
  players: Player[];
  spend: number;
  remaining: number;
  projected: number;
  leagues: League[];
  togglePlayer: (id: string) => void;
  setCaptain: (id: string | null) => void;
  setIdentity: (manager: string, teamName: string) => void;
  saveTeam: () => void;
  autoFill: () => void;
  joinLeague: (code: string) => { ok: boolean; message: string };
  createLeague: (name: string) => League;
  leaveLeague: (id: string) => void;
  resetTeam: () => void;
  loadDemo: () => void;
  clearSquad: () => void;
  errors: string[];
  isSaved: boolean;
};

const FantasyContext = createContext<FantasyContextValue | null>(null);

function readStored(): TeamState {
  if (typeof window === "undefined") return DEMO_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEMO_STATE;
    const parsed = JSON.parse(raw) as TeamState;
    return {
      ...DEMO_STATE,
      ...parsed,
      squad: Array.isArray(parsed.squad) ? parsed.squad : [],
      joinedLeagues: Array.isArray(parsed.joinedLeagues) ? parsed.joinedLeagues : [],
      customLeagues: Array.isArray(parsed.customLeagues) ? parsed.customLeagues : [],
    };
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
      /* storage unavailable — demo still works in memory */
    }
  }, [state, ready]);

  const togglePlayer = useCallback((id: string) => {
    setState((prev) => {
      const inSquad = prev.squad.includes(id);
      if (inSquad) {
        return {
          ...prev,
          squad: prev.squad.filter((x) => x !== id),
          captain: prev.captain === id ? null : prev.captain,
        };
      }
      const player = PLAYER_BY_ID[id];
      if (!player) return prev;
      if (prev.squad.length >= SQUAD_SIZE) return prev;
      if (sideCount(prev.squad, player.side) >= MAX_PER_SIDE) return prev;
      if (spendOf(prev.squad) + player.price > BUDGET) return prev;
      return { ...prev, squad: [...prev.squad, id] };
    });
  }, []);

  const setCaptain = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, captain: id }));
  }, []);

  const setIdentity = useCallback((manager: string, teamName: string) => {
    setState((prev) => ({ ...prev, manager, teamName }));
  }, []);

  const saveTeam = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isDemo: false,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const autoFill = useCallback(() => {
    const { squad, captain } = autoPick();
    setState((prev) => ({ ...prev, squad, captain, isDemo: false }));
  }, []);

  const joinLeague = useCallback((code: string) => {
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
  }, [state.customLeagues, state.joinedLeagues]);

  const createLeague = useCallback((name: string) => {
    const code = (name.replace(/[^a-zA-Z]/g, "").toUpperCase() + "27").slice(0, 6).padEnd(6, "X");
    const league: League = {
      id: `custom-${Date.now()}`,
      name: name.trim() || "New league",
      code,
      visibility: "private",
      blurb: "Your new private league. Share the code — the table fills up as mates join.",
      members: [
        {
          manager: state.manager || "You",
          team: state.teamName || "Your team",
          points: projectedOf(state.squad, state.captain),
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
  }, [state.captain, state.manager, state.squad, state.teamName]);

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
    setState({ ...DEMO_STATE, updatedAt: new Date().toISOString() });
  }, []);

  const clearSquad = useCallback(() => {
    setState((prev) => ({ ...prev, squad: [], captain: null, isDemo: false }));
  }, []);

  const leagues = useMemo(
    () => [...LEAGUES, ...state.customLeagues],
    [state.customLeagues],
  );

  const spend = spendOf(state.squad);
  const projected = projectedOf(state.squad, state.captain);
  const errors = useMemo(() => validateSquad(state.squad), [state.squad]);
  const isSaved = state.updatedAt !== null && !state.isDemo;

  return (
    <FantasyContext.Provider
      value={{
        state,
        ready,
        players: PLAYERS,
        spend,
        remaining: BUDGET - spend,
        projected,
        leagues,
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
        errors,
        isSaved,
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

