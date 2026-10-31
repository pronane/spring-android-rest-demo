"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui";
import {
  DRIVE_RANGE,
  MAX_POINTS_PER_GUESS,
  PIN_RANGE,
  PINPOINT_DAYS,
  scorePinpoint,
  simulatedResults,
  type PinpointGuess,
} from "@/lib/pinpoint";
import { useFantasy } from "@/lib/store";

export default function PinpointPage() {
  const { state, setPinpoint, paid } = useFantasy();
  const [showSim, setShowSim] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const results = useMemo(() => simulatedResults(), []);
  const score = useMemo(() => scorePinpoint(state.pinpoint, results), [state.pinpoint, results]);
  const filled = PINPOINT_DAYS.reduce((n, d) => {
    const g = state.pinpoint[d.id];
    return n + (g?.pin != null ? 1 : 0) + (g?.drive != null ? 1 : 0);
  }, 0);

  const update = (dayId: string, key: keyof PinpointGuess, raw: string) => {
    const prev = state.pinpoint[dayId] ?? { pin: null, drive: null };
    const value = raw === "" ? null : Number(raw);
    setPinpoint(dayId, { ...prev, [key]: value !== null && Number.isFinite(value) ? value : null });
    setSaveMsg(null);
  };

  const save = async () => {
    setSaveMsg(null);
    try {
      const res = await fetch("/api/entry", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: state.mode,
          squad: state.squad,
          captain: state.captain,
          predictions: state.predictions,
          awards: state.awards,
          pinpoint: state.pinpoint,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveMsg(res.ok ? "Pinpoint guesses saved ✓" : (data.error ?? "Could not save your guesses."));
    } catch {
      setSaveMsg("You're offline — guesses are kept on this device.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-10">
      <Eyebrow>Pinpoint · side game</Eyebrow>
      <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Closest to the pin, longest off the tee</h1>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-cream/70">
        Each day, guess how close the best tee shot finishes on the featured par 3, and how far the
        longest drive goes on the featured par 5. A perfect call is worth {MAX_POINTS_PER_GUESS}; you
        lose a point for every foot (or every three yards) you&apos;re out. Guesses lock with your card
        at the first tee.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PINPOINT_DAYS.map((day) => {
          const g = state.pinpoint[day.id] ?? { pin: null, drive: null };
          const r = results[day.id];
          const s = score.byDay[day.id];
          return (
            <section key={day.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <h2 className="font-display text-2xl text-cream">{day.label}</h2>

              <label className="mt-4 block">
                <span className="text-[11px] uppercase tracking-[0.14em] text-cream/60">
                  Nearest the pin (feet)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={PIN_RANGE.min}
                  max={PIN_RANGE.max}
                  step="0.5"
                  value={g.pin ?? ""}
                  onChange={(e) => update(day.id, "pin", e.target.value)}
                  placeholder="e.g. 4.5"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-forest-950/60 px-3 py-2 text-[14px] text-cream tnum placeholder:text-cream/60"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[11px] uppercase tracking-[0.14em] text-cream/60">
                  Longest drive (yards)
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={DRIVE_RANGE.min}
                  max={DRIVE_RANGE.max}
                  value={g.drive ?? ""}
                  onChange={(e) => update(day.id, "drive", e.target.value)}
                  placeholder="e.g. 352"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-forest-950/60 px-3 py-2 text-[14px] text-cream tnum placeholder:text-cream/60"
                />
              </label>

              {showSim ? (
                <dl className="mt-4 space-y-1 border-t border-white/10 pt-3 text-[12px]">
                  <div className="flex justify-between">
                    <dt className="text-cream/70">Pin: {r.pin} ft</dt>
                    <dd className="tnum text-gold-soft">+{s.pin}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-cream/70">Drive: {r.drive} yd</dt>
                    <dd className="tnum text-gold-soft">+{s.drive}</dd>
                  </div>
                </dl>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {paid ? (
          <button
            type="button"
            onClick={save}
            className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
          >
            Save my guesses
          </button>
        ) : (
          <Link
            href="/enter"
            className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
          >
            Play free to save guesses
          </Link>
        )}
        <button
          type="button"
          onClick={() => setShowSim((v) => !v)}
          className="rounded-full border border-white/15 px-4 py-2 text-[12.5px] text-cream/70 transition hover:border-gold/50"
        >
          {showSim ? "Hide simulated results" : "Try it: simulate the results"}
        </button>
        <span className="text-[12px] text-cream/70 tnum">
          {filled}/6 guesses{showSim ? ` · ${score.total} pts in the simulation` : ""}
        </span>
      </div>
      {saveMsg ? (
        <p role="status" className="mt-2 text-[12px] text-cream/60">
          {saveMsg}
        </p>
      ) : null}
      <p className="mt-6 text-[10.5px] leading-relaxed text-cream/60">
        Simulated results are for trying the scoring before the week; real results come from the
        official shot data once the live feed is connected.
      </p>
    </div>
  );
}
