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
  if (new Set(squad).size !== squad.length) {
    errors.push("A player can only be picked once.");
  }
  if (squad.some((id) => !PLAYER_BY_ID[id])) {
    errors.push("Your card includes a player who is no longer in the pool.");
  }
  if (squad.length !== cfg.squadSize) {
    errors.push(`Pick ${cfg.squadSize} players — you have ${squad.length}.`);
  }
  if (spendOf(squad) > cfg.budget) {
    errors.push(`You are ${credits(spendOf(squad) - cfg.budget)}m over the ${cfg.budget}m budget.`);
  }
  if (sideCount(squad, "europe") > cfg.maxPerSide || sideCount(squad, "usa") > cfg.maxPerSide) {
    errors.push(`Maximum ${cfg.maxPerSide} players from one side.`);
  }
  if (squad.length > 0 && (sideCount(squad, "europe") === 0 || sideCount(squad, "usa") === 0)) {
    errors.push("Your card must include at least one player from each side.");
  }
  return errors;
}

/**
 * Highest-projected legal card for the selected mode. Depth-first search with
 * pruning on budget and side caps: the unpruned version enumerated every
 * C(24,12) ≈ 2.7M twelve-man card on the main thread and froze phones when
 * "Auto-pick" was tapped in Captain's Dozen.
 */
export function autoPick(mode: ModeId = "classic"): { squad: string[]; captain: string } {
  const cfg = modeConfig(mode);
  // Best players first so good cards are found early and the bound bites sooner.
  const pool = [...PLAYERS].sort((a, b) => b.projected - a.projected);
  const n = pool.length;
  const cheapest = Math.min(...pool.map((p) => p.price));
  let best: { ids: string[]; score: number } | null = null;
  const chosen: number[] = [];

  const walk = (start: number, budget: number, europe: number, usa: number, score: number) => {
    const left = cfg.squadSize - chosen.length;
    if (left === 0) {
      if (europe === 0 || usa === 0) return;
      if (!best || score > best.score) best = { ids: chosen.map((i) => pool[i].id), score };
      return;
    }
    if (n - start < left) return;
    if (budget + cheapest * left > cfg.budget) return;
    // Upper bound: the next `left` players in projection order.
    if (best) {
      let bound = score;
      for (let i = start; i < start + left; i += 1) bound += pool[i].projected;
      if (bound <= best.score) return;
    }
    for (let i = start; i < n; i += 1) {
      const p = pool[i];
      const nextBudget = budget + p.price;
      if (nextBudget > cfg.budget) continue;
      const e = europe + (p.side === "europe" ? 1 : 0);
      const u = usa + (p.side === "usa" ? 1 : 0);
      if (e > cfg.maxPerSide || u > cfg.maxPerSide) continue;
      chosen.push(i);
      walk(i + 1, nextBudget, e, u, score + p.projected);
      chosen.pop();
    }
  };

  walk(0, 0, 0, 0, 0);
  const ids: string[] = (best as { ids: string[] } | null)?.ids ?? [];
  const captain = [...ids].sort(
    (a, b) => PLAYER_BY_ID[b].projected - PLAYER_BY_ID[a].projected,
  )[0];
  return { squad: ids, captain };
}

/** Cards and predictions freeze at the first tee of the edition. */
export function isLocked(firstTee: string, now: Date = new Date()): boolean {
  const lock = Date.parse(firstTee);
  return Number.isFinite(lock) && now.getTime() >= lock;
}

export function rankOf(value: number, field: number[]): number {
  return field.filter((p) => p > value).length + 1;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
