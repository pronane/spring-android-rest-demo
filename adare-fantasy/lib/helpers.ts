/**
 * Pure, framework-free helpers. Kept out of the "use client" store so that
 * server components can call them directly.
 */
import {
  BUDGET,
  MAX_PER_SIDE,
  PLAYERS,
  PLAYER_BY_ID,
  SQUAD_SIZE,
  type Side,
} from "./data";

export function spendOf(squad: string[]): number {
  return squad.reduce((total, id) => total + (PLAYER_BY_ID[id]?.price ?? 0), 0);
}

export function credits(n: number): string {
  return n.toFixed(1);
}

export function sideCount(squad: string[], side: Side): number {
  return squad.filter((id) => PLAYER_BY_ID[id]?.side === side).length;
}

/** Projected points, with the captain's armband doubling his output. */
export function projectedOf(squad: string[], captain: string | null): number {
  return squad.reduce((total, id) => {
    const player = PLAYER_BY_ID[id];
    if (!player) return total;
    return total + (id === captain ? player.projected * 2 : player.projected);
  }, 0);
}

export function validateSquad(squad: string[]): string[] {
  const errors: string[] = [];
  if (squad.length !== SQUAD_SIZE) {
    errors.push(`Pick ${SQUAD_SIZE} players — you have ${squad.length}.`);
  }
  if (spendOf(squad) > BUDGET) {
    errors.push(`You are ${credits(spendOf(squad) - BUDGET)}m over the ${BUDGET}m budget.`);
  }
  if (sideCount(squad, "europe") > MAX_PER_SIDE) {
    errors.push(`Maximum ${MAX_PER_SIDE} players from one side.`);
  }
  if (sideCount(squad, "usa") > MAX_PER_SIDE) {
    errors.push(`Maximum ${MAX_PER_SIDE} players from one side.`);
  }
  if (squad.length > 0 && (sideCount(squad, "europe") === 0 || sideCount(squad, "usa") === 0)) {
    errors.push("Your six must include at least one player from each side.");
  }
  return errors;
}

/** Brute-force the highest-projected legal six. 24C6 = 134,596 combinations. */
export function autoPick(): { squad: string[]; captain: string } {
  const pool = PLAYERS;
  const n = pool.length;
  const found: { best: { ids: string[]; score: number } | null } = { best: null };
  const chosen: number[] = [];

  const walk = (start: number) => {
    if (chosen.length === SQUAD_SIZE) {
      let europe = 0;
      let budget = 0;
      for (const i of chosen) {
        if (pool[i].side === "europe") europe += 1;
        budget += pool[i].price;
      }
      const usa = SQUAD_SIZE - europe;
      if (budget > BUDGET || europe > MAX_PER_SIDE || usa > MAX_PER_SIDE) return;
      const score = chosen.reduce((sum, i) => sum + pool[i].projected * 1.15, 0);
      if (!found.best || score > found.best.score) {
        found.best = { ids: chosen.map((i) => pool[i].id), score };
      }
      return;
    }
    for (let i = start; i < n; i += 1) {
      chosen.push(i);
      walk(i + 1);
      chosen.pop();
    }
  };

  walk(0);
  const ids = found.best?.ids ?? [];
  const captain = [...ids].sort(
    (a, b) => PLAYER_BY_ID[b].projected - PLAYER_BY_ID[a].projected,
  )[0];
  return { squad: ids, captain };
}

export function rankOf(value: number, field: number[]): number {
  return field.filter((p) => p > value).length + 1;
}
