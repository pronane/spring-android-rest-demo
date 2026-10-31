/**
 * The tournament clock, on the server.
 *
 * Nothing in the scoring path asks the browser what time it is: a snapshot is
 * taken from this clock, so a leaderboard, a share page and the API all agree
 * to the minute. Three modes, all set by environment:
 *
 *  - `SCORING_CLOCK=live` (with `FIRST_TEE_AT`, default the Adare first tee):
 *    minutes elapsed since the first tee, capped at the end of Sunday singles.
 *  - `SCORING_CLOCK=at:<minute>`: a fixed minute — used by the tests and by an
 *    operator replaying a day (`/api/leaderboard?at=1500` overrides it too).
 *  - unset: the whole weekend is in the books, which is the settled state the
 *    rest of the app has always shown.
 */
import { SESSIONS, SIM_END } from "@/lib/sim";

export const FIRST_TEE_AT = "2027-09-17T07:35:00+01:00";

export type ClockMode = "final" | "fixed" | "live" | "pre";

export type ScoringClock = {
  minute: number;
  mode: ClockMode;
  label: string;
};

const clamp = (n: number) => Math.max(0, Math.min(SIM_END, Math.floor(n)));

function fixedMinute(env: string | undefined): number | null {
  const match = /^at:(\d+)$/.exec(env ?? "");
  if (!match) return null;
  const minute = Number(match[1]);
  return Number.isFinite(minute) ? clamp(minute) : null;
}

/** Where the weekend is, according to the server. */
export function scoringClock(
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
): ScoringClock {
  const fixed = fixedMinute(env.SCORING_CLOCK);
  if (fixed !== null) {
    return { minute: fixed, mode: "fixed", label: `Replay · minute ${fixed}` };
  }

  if (env.SCORING_CLOCK === "live") {
    const tee = new Date(env.FIRST_TEE_AT || FIRST_TEE_AT).getTime();
    if (Number.isFinite(tee)) {
      const minute = clamp((now.getTime() - tee) / 60_000);
      const phase = minute >= SESSIONS[SESSIONS.length - 1].endMin ? "final" : minute > 0 ? "live" : "pre";
      return {
        minute,
        mode: "live",
        label:
          phase === "pre"
            ? "Before the first tee"
            : phase === "final"
              ? "All 28 matches in the books"
              : "Live from Adare",
      };
    }
  }

  return { minute: SIM_END, mode: "final", label: "Full weekend" };
}

/**
 * The clock the *card* runs on — deadlines, transfers, the armband.
 *
 * This is not always the results clock: the demo scores the finished weekend so
 * the table has something in it, but a card entered today (before the first tee)
 * must still be editable. So with no `SCORING_CLOCK` set, the card clock is real
 * time relative to the first tee — negative before it, which is the pre-lock
 * window. Set `SCORING_CLOCK` and the card clock follows it exactly, which is
 * what a replay needs.
 */
export function cardClock(
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
): ScoringClock {
  if (env.SCORING_CLOCK) return scoringClock(now, env);
  const tee = new Date(env.FIRST_TEE_AT || FIRST_TEE_AT).getTime();
  if (!Number.isFinite(tee)) return { minute: 0, mode: "pre", label: "Before the first tee" } as ScoringClock;
  const minute = Math.max(-604_800, Math.min(SIM_END, Math.floor((now.getTime() - tee) / 60_000)));
  return {
    minute,
    mode: "live",
    label: minute < 0 ? "Before the first tee" : minute >= SIM_END ? "All 28 matches in the books" : "Live from Adare",
  };
}

/** Human phase of the weekend at a minute, for headers and share cards. */
export function phaseAt(minute: number): "pre" | "live" | "done" {
  if (minute <= 0) return "pre";
  if (minute >= SESSIONS[SESSIONS.length - 1].endMin) return "done";
  return "live";
}
