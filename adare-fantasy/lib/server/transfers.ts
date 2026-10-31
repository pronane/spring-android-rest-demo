/**
 * Transfers and the armband, on the server.
 *
 * The rules live in `lib/transfers.ts`; this module does the things that need
 * the store: read the saved card, refuse a swap if the clock or the budget says
 * no, write the swap, and hand back what the page needs to draw. Every write is
 * re-checked here rather than trusted from the browser — an entry is worth money.
 */
import { PLAYER_BY_ID } from "@/lib/data";
import { checkTransfer, replacementsFor, transferState, type TransferState } from "@/lib/transfers";
import type { ModeId } from "@/lib/tournaments";
import { findUser, recordTransfer, setSessionCaptains, type Entry, type User } from "./db";
import { cardClock } from "./clock";

export class TransferError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export type SquadPlayer = {
  id: string;
  name: string;
  shortName: string;
  side: "europe" | "usa";
  price: number;
  projected: number;
  role: string;
  captain: boolean;
};

function squadPlayers(entry: Entry): SquadPlayer[] {
  return (entry.squad ?? []).flatMap((id) => {
    const player = PLAYER_BY_ID[id];
    if (!player) return [];
    return [
      {
        id,
        name: player.name,
        shortName: player.shortName,
        side: player.side,
        price: player.price,
        projected: player.projected,
        role: player.role,
        captain: entry.captain === id,
      },
    ];
  });
}

export type TransferOverview = {
  entry: { ref: string; team: string; manager: string };
  mode: ModeId;
  squad: SquadPlayer[];
  captain: string | null;
  sessionCaptains: Entry["sessionCaptains"];
  state: TransferState;
  transfers: Entry["transfers"];
  /** Legal replacements, keyed by the player being dropped. */
  options: Record<string, SquadPlayer[]>;
};

function optionsFor(entry: Entry): Record<string, SquadPlayer[]> {
  const mode = (entry.mode ?? "classic") as ModeId;
  const squad = entry.squad ?? [];
  const out: Record<string, SquadPlayer[]> = {};
  for (const id of squad) {
    out[id] = replacementsFor(squad, mode, id)
      .slice(0, 14)
      .map((p) => ({
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        side: p.side,
        price: p.price,
        projected: p.projected,
        role: p.role,
        captain: false,
      }));
  }
  return out;
}

function requireCard(user: User): Entry & { squad: string[] } {
  const entry = user.entry;
  if (!entry?.ref) throw new TransferError("No paid entry on this account yet.", 402);
  if (!entry.squad?.length) throw new TransferError("Save a card before making transfers.", 409);
  return entry as Entry & { squad: string[] };
}

export async function transferOverview(userId: string, minute = cardClock().minute): Promise<TransferOverview> {
  const user = await findUser(userId);
  if (!user) throw new TransferError("Not signed in.", 401);
  const entry = requireCard(user);
  return {
    entry: { ref: entry.ref, team: user.teamName, manager: user.manager },
    mode: (entry.mode ?? "classic") as ModeId,
    squad: squadPlayers(entry),
    captain: entry.captain ?? null,
    sessionCaptains: entry.sessionCaptains ?? {},
    state: transferState(entry, minute),
    transfers: entry.transfers ?? [],
    options: optionsFor(entry),
  };
}

/** One swap, checked against the clock, the rules and the budget. */
export async function makeTransfer(
  userId: string,
  input: { out?: unknown; in?: unknown },
): Promise<{ overview: TransferOverview; penalty: number }> {
  const user = await findUser(userId);
  if (!user) throw new TransferError("Not signed in.", 401);
  const entry = requireCard(user);

  const out = typeof input.out === "string" ? input.out : "";
  const into = typeof input.in === "string" ? input.in : "";
  const minute = cardClock().minute;

  const check = checkTransfer({
    squad: entry.squad,
    mode: (entry.mode ?? "classic") as ModeId,
    out,
    in: into,
    minute,
    entry,
  });
  if (!check.ok) throw new TransferError(check.errors[0], 422);
  if (!check.window) throw new TransferError("Transfers are closed.", 409);

  const written = await recordTransfer(userId, {
    out,
    in: into,
    window: check.window.id,
    penalty: check.penalty,
  });
  if (!written) throw new TransferError("The card changed while you were editing it. Try again.", 409);

  return { overview: await transferOverview(userId, minute), penalty: check.penalty };
}

/**
 * Sets the armband for one or more days. A day's captain must be on the card;
 * `null` means no armband that day, which is a legitimate choice (it keeps the
 * "double a player who is benched" trick from being the only move).
 */
export async function updateSessionCaptains(
  userId: string,
  input: unknown,
): Promise<{ sessionCaptains: Entry["sessionCaptains"] }> {
  const user = await findUser(userId);
  if (!user) throw new TransferError("Not signed in.", 401);
  const entry = requireCard(user);

  if (!input || typeof input !== "object") throw new TransferError("Send a day and a player.", 400);
  const raw = input as Record<string, unknown>;
  const next: Entry["sessionCaptains"] = { ...(entry.sessionCaptains ?? {}) };

  for (const day of ["fri", "sat", "sun"] as const) {
    if (!(day in raw)) continue;
    const value = raw[day];
    if (value === null) {
      next[day] = null;
      continue;
    }
    if (typeof value !== "string" || !entry.squad.includes(value)) {
      throw new TransferError("The armband has to go to a player on your card.", 422);
    }
    next[day] = value;
  }

  const saved = await setSessionCaptains(userId, next);
  if (!saved) throw new TransferError("No paid entry on this account yet.", 402);
  return { sessionCaptains: saved.sessionCaptains ?? {} };
}
