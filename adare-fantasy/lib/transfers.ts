/**
 * Transfers and the armband — the rules, as pure functions.
 *
 * A card is not frozen once it is saved: it can be changed in the gaps between
 * sessions (the overnight windows), and never while a session is under way.
 * Two changes are free for the whole edition; after that each one costs
 * `SCORING.transferPenalty` points, deducted from the entry's total rather than
 * from the card, so the breakdown on the account page still adds up.
 *
 * A referral adds a free change to both sides (`bonusTransfers`). The pure part
 * lives here so `scripts/scoring-check.mjs` can test it without a server.
 */
import { PLAYER_BY_ID, SCORING, type Player } from "./data";
import { modeConfig, spendOf, validateSquad } from "./helpers";
import { SESSIONS } from "./sim";
import type { ModeId } from "./tournaments";

export type TransferWindowId = "pre" | "fri-sat" | "sat-sun";

export type TransferWindow = {
  id: TransferWindowId;
  label: string;
  /** Tournament minute the window opens. */
  opens: number;
  /** Tournament minute the window closes (the next session's first tee). */
  closes: number;
};

const FIRST_TEE = SESSIONS[0].startMin;

/**
 * Windows sit between sessions, and the first one is the run-up to the first
 * tee. Once Sunday's singles start there is no window left, because the edition
 * finishes inside that session.
 */
export const TRANSFER_WINDOWS: TransferWindow[] = [
  { id: "pre", label: "Before the first tee", opens: FIRST_TEE - 604_800, closes: FIRST_TEE },
  { id: "fri-sat", label: "Friday night", opens: SESSIONS[1].endMin, closes: SESSIONS[2].startMin },
  { id: "sat-sun", label: "Saturday night", opens: SESSIONS[3].endMin, closes: SESSIONS[4].startMin },
];

export function windowAt(minute: number): TransferWindow | null {
  return TRANSFER_WINDOWS.find((w) => minute >= w.opens && minute < w.closes) ?? null;
}

export function nextWindow(minute: number): TransferWindow | null {
  return TRANSFER_WINDOWS.find((w) => w.opens > minute) ?? null;
}

export type TransferRecord = {
  out: string;
  in: string;
  at: string;
  /** Which window it happened in (`pre`, `fri-sat`, `sat-sun`). */
  window: string;
  penalty: number;
};

export type TransferState = {
  /** Where the clock is; fed in so this stays a pure function. */
  minute: number;
  open: boolean;
  window: TransferWindow | null;
  next: TransferWindow | null;
  /** Changes made since the lock (the pre-lock ones are free edits). */
  used: number;
  /** Edits made before the lock, when the card was still open. */
  preLock: number;
  free: number;
  bonus: number;
  remainingFree: number;
  /** What the next change costs, in points. */
  cost: number;
  penaltyPaid: number;
};

export function transferState(
  entry: { transfers?: TransferRecord[]; bonusTransfers?: number },
  minute: number,
): TransferState {
  const transfers = entry.transfers ?? [];
  const bonus = Math.max(0, entry.bonusTransfers ?? 0);
  const free = SCORING.freeTransfers + bonus;
  // Before the first tee the card is simply open: those edits cost nothing and
  // do not eat the allowance.
  const sinceLock = transfers.filter((t) => t.window !== "pre");
  const usedFree = sinceLock.filter((t) => t.penalty === 0).length;
  const remainingFree = Math.max(0, free - usedFree);
  const window = windowAt(minute);
  return {
    minute,
    open: Boolean(window),
    window,
    next: nextWindow(minute),
    used: sinceLock.length,
    preLock: transfers.length - sinceLock.length,
    free,
    bonus,
    remainingFree,
    cost: minute < 0 ? 0 : remainingFree > 0 ? 0 : SCORING.transferPenalty,
    penaltyPaid: transfers.reduce((sum, t) => sum + t.penalty, 0),
  };
}

export type TransferCheck = {
  ok: boolean;
  errors: string[];
  penalty: number;
  window: TransferWindow | null;
  /** The card after the change, when it is legal. */
  squad: string[];
};

/**
 * Checks one swap against the same rules the original card had (size, budget,
 * side limits) plus the clock and the allowance. Returns every reason it fails,
 * because the UI shows them all rather than one at a time.
 */
export function checkTransfer(input: {
  squad: string[];
  mode: ModeId;
  out: string;
  in: string;
  minute: number;
  entry: { transfers?: TransferRecord[]; bonusTransfers?: number };
}): TransferCheck {
  const state = transferState(input.entry, input.minute);
  const errors: string[] = [];
  const squad = [...input.squad];

  if (!state.open) {
    errors.push(
      state.next
        ? `Transfers are closed while a session is under way. The ${state.next.label.toLowerCase()} window opens after the last match.`
        : "The edition is finished — there are no transfer windows left.",
    );
  }
  if (!squad.includes(input.out)) errors.push("That player is not on your card.");
  if (squad.includes(input.in)) errors.push("That player is already on your card.");
  if (!PLAYER_BY_ID[input.in]) errors.push("That player is not in the pool.");
  if (input.out === input.in) errors.push("Pick a different player to bring in.");

  const next = errors.length > 0 ? squad : squad.map((id) => (id === input.out ? input.in : id));
  if (!errors.length) {
    const cfg = modeConfig(input.mode);
    if (spendOf(next) > cfg.budget) {
      errors.push(
        `${PLAYER_BY_ID[input.in].shortName} would put you over the ${cfg.budget}m budget.`,
      );
    }
    const structural = validateSquad(next, input.mode);
    if (structural.length > 0) errors.push(...structural);
  }

  return {
    ok: errors.length === 0,
    errors,
    penalty: state.cost,
    window: state.window,
    squad: next,
  };
}

/** Legal replacements for a player: same side or either, whatever fits. */
export function replacementsFor(
  squad: string[],
  mode: ModeId,
  outId: string,
  players: Player[] = Object.values(PLAYER_BY_ID),
): Player[] {
  const cfg = modeConfig(mode);
  const others = squad.filter((id) => id !== outId);
  const spent = spendOf(others);
  const europe = others.filter((id) => PLAYER_BY_ID[id]?.side === "europe").length;
  const usa = others.length - europe;

  return players
    .filter((player) => !squad.includes(player.id))
    .filter((player) => spent + player.price <= cfg.budget)
    .filter((player) => (player.side === "europe" ? europe + 1 : usa + 1) <= cfg.maxPerSide)
    .sort((a, b) => b.projected - a.projected);
}

/** The penalty a set of transfers has already cost this entry. */
export function penaltyFor(transfers: TransferRecord[] | undefined): number {
  return (transfers ?? []).reduce((sum, t) => sum + Math.max(0, t.penalty), 0);
}
