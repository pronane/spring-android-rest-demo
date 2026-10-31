/**
 * Pure, framework-free game logic. Kept out of the "use client" store so that
 * server components and API routes can call it directly.
 */
import { PLAYERS, PLAYER_BY_ID, type Side } from "./data";
import { MODES, type ModeId } from "./tournaments";

export function modeConfig(mode: ModeId = "classic") {
  return MODES[mode] ?? MODES.classic;
}

export function spendOf(squad: string[]): number {
  return squad.reduce((total, id) => total + (PLAYER_BY_ID[id]?.price ?? 0), 0);
}

export function credits(n: number): string {
  return n.toFixed(1);
}

export function eur(n: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function sideCount(squad: string[], side: Side): number {
  return squad.filter((id) => PLAYER_BY_ID[id]?.side === side).length;
}

/** Projected points, with the captain's armband doubling his match points. */
export function projectedOf(
  squad: string[],
  captain: string | null,
  mode: ModeId = "classic",
): number {
  const cfg = modeConfig(mode);
  return squad.reduce((total, id) => {
    const player = PLAYER_BY_ID[id];
    if (!player) return total;
    // In the full mode a twelve-man card is scored across every session, so the
    // per-player projection is scaled down slightly (players are rested more).
    const base = player.projected * (cfg.squadSize === 12 ? 0.72 : 1);
    return total + (id === captain ? base * 2 : base);
  }, 0);
}

export function validateSquad(squad: string[], mode: ModeId = "classic"): string[] {
  const cfg = modeConfig(mode);
  const errors: string[] = [];
  if (squad.length !== cfg.squadSize) {
    errors.push(`Pick ${cfg.squadSize} players — you have ${squad.length}.`);
  }
  if (spendOf(squad) > cfg.budget) {
    errors.push(`You are ${credits(spendOf(squad) - cfg.budget)}m over the ${cfg.budget}m budget.`);
  }
  if (sideCount(squad, "europe") > cfg.maxPerSide) {
    errors.push(`Maximum ${cfg.maxPerSide} players from one side.`);
  }
  if (sideCount(squad, "usa") > cfg.maxPerSide) {
    errors.push(`Maximum ${cfg.maxPerSide} players from one side.`);
  }
  if (squad.length > 0 && (sideCount(squad, "europe") === 0 || sideCount(squad, "usa") === 0)) {
    errors.push("Your card must include at least one player from each side.");
  }
  return errors;
}

/** Brute-force the highest-projected legal card for the selected mode. */
export function autoPick(mode: ModeId = "classic"): { squad: string[]; captain: string } {
  const cfg = modeConfig(mode);
  const pool = PLAYERS;
  const n = pool.length;
  const found: { best: { ids: string[]; score: number } | null } = { best: null };
  const chosen: number[] = [];

  const walk = (start: number) => {
    if (chosen.length === cfg.squadSize) {
      let europe = 0;
      let budget = 0;
      for (const i of chosen) {
        if (pool[i].side === "europe") europe += 1;
        budget += pool[i].price;
      }
      const usa = cfg.squadSize - europe;
      if (budget > cfg.budget || europe > cfg.maxPerSide || usa > cfg.maxPerSide) return;
      // Require at least one from each side.
      if (europe === 0 || usa === 0) return;
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

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
