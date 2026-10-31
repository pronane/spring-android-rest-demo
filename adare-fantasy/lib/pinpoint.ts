/**
 * Pinpoint: a skill side-game. Each day of the cup you guess how close the best
 * tee shot finishes on that day's featured par 3 (feet) and the longest drive on
 * the featured par 5 (yards). Closest guesses score most.
 *
 * Until a live data feed is wired in, results come from a seeded simulation so
 * the scoring can be shown and tested; the UI labels them as simulated.
 */

export type PinpointDay = { id: "fri" | "sat" | "sun"; label: string };
export type PinpointGuess = { pin: number | null; drive: number | null };
export type PinpointResult = { pin: number; drive: number };

export const PINPOINT_DAYS: PinpointDay[] = [
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
];

export const PIN_RANGE = { min: 0, max: 60 } as const; // feet
export const DRIVE_RANGE = { min: 260, max: 420 } as const; // yards
export const MAX_POINTS_PER_GUESS = 10;

/** Small deterministic PRNG (mulberry32) so a seed always gives the same results. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulatedResults(seed = 2027): Record<PinpointDay["id"], PinpointResult> {
  const next = rng(seed * 31 + 7);
  const one = (): PinpointResult => ({
    pin: Math.round((1 + next() * 14) * 10) / 10, // 1–15 ft: the best shot of the day
    drive: Math.round(330 + next() * 45), // 330–375 yd
  });
  return { fri: one(), sat: one(), sun: one() };
}

/** 10 for a perfect call; −1 per foot (pin) or per 3 yards (drive) off, floor 0. */
export function scoreGuess(kind: "pin" | "drive", guess: number | null, actual: number): number {
  if (guess == null || !Number.isFinite(guess)) return 0;
  const miss = Math.abs(guess - actual) / (kind === "pin" ? 1 : 3);
  return Math.max(0, Math.round((MAX_POINTS_PER_GUESS - miss) * 10) / 10);
}

export function scorePinpoint(
  guesses: Record<string, PinpointGuess>,
  results: Record<PinpointDay["id"], PinpointResult>,
): { total: number; byDay: Record<string, { pin: number; drive: number }> } {
  const byDay: Record<string, { pin: number; drive: number }> = {};
  let total = 0;
  for (const day of PINPOINT_DAYS) {
    const g = guesses[day.id] ?? { pin: null, drive: null };
    const r = results[day.id];
    const pin = scoreGuess("pin", g.pin, r.pin);
    const drive = scoreGuess("drive", g.drive, r.drive);
    byDay[day.id] = { pin, drive };
    total += pin + drive;
  }
  return { total: Math.round(total * 10) / 10, byDay };
}

/** Clamp and validate a guess coming from a form or the API. */
export function cleanGuess(raw: unknown): PinpointGuess {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
  };
  return { pin: num(obj.pin, PIN_RANGE.min, PIN_RANGE.max), drive: num(obj.drive, DRIVE_RANGE.min, DRIVE_RANGE.max) };
}
