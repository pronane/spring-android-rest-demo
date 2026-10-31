/**
 * Money maths for the entry fee and the prize pool.
 *
 * Everything here works in whole euro cents so nothing depends on float
 * behaviour: an entry fee of €10 is 1000, not 10.000000001. Values are converted
 * back to euros only for display and for the ledger, which stores cents.
 */
import { PRIZE_SPLIT } from "@/lib/tournaments";

/** Share of an entry that funds prizes; the rest is platform and card fees. */
export const PLATFORM_SHARE = 0.05;

export type Allocation = {
  cents: number;
  platformCents: number;
  poolCents: number;
};

export function cents(euros: number): number {
  return Math.round(euros * 100);
}

export function euros(c: number): number {
  return Math.round(c) / 100;
}

/** Split a payment into the platform's cut and the prize pool. */
export function allocate(amountCents: number): Allocation {
  const platformCents = Math.round(amountCents * PLATFORM_SHARE);
  return {
    cents: amountCents,
    platformCents,
    poolCents: amountCents - platformCents,
  };
}

export type PrizeLine = { label: string; share: number; cents: number };

/**
 * Divide a pot by the published split. Rounding is done once per line, then the
 * remainder is pushed onto first place so the lines always add up to the pot —
 * a pool that loses a cent to rounding is the kind of thing an entrant notices.
 */
export function splitPot(potCents: number): PrizeLine[] {
  const lines = PRIZE_SPLIT.map((line) => ({
    label: line.label,
    share: line.share,
    cents: Math.round(potCents * line.share),
  }));
  const total = lines.reduce((sum, line) => sum + line.cents, 0);
  const drift = potCents - total;
  if (drift !== 0) lines[0].cents += drift;
  return lines;
}

/** The prize lines that are awarded to entrants (fees are not a prize). */
export function awardableLines(potCents: number): PrizeLine[] {
  return splitPot(potCents).filter((line) => line.label !== "Platform & card fees");
}

export function formatMoney(amountCents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
