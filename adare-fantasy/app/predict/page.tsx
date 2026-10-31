"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { PLAYERS, PLAYER_BY_ID, SIDE_COLOR } from "@/lib/data";
import { useFantasy } from "@/lib/store";
import { SESSIONS, pairingsFor, type Pick } from "@/lib/sim";

const AWARDS = [
  { key: "mvp", label: "MVP", hint: "Most valuable player of the week" },
  { key: "topScorer", label: "Top scorer", hint: "Most points won for his side" },
  { key: "rookie", label: "Rookie of the week", hint: "Best first-timer" },
] as const;

const ROOKIES = ["rasmus", "griffin", "spaun", "straka", "mcnealy"];

const PICKS: { value: Pick; label: string }[] = [
  { value: "europe", label: "Europe" },
  { value: "half", label: "Halve" },
  { value: "usa", label: "USA" },
];

export default function PredictPage() {
  const { state, setPrediction, clearPredictions, setAward, paid } = useFantasy();
  const [activeSession, setActiveSession] = useState(0);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Picks used to live only in this browser; nothing sent them to the server
  // unless you went back to /draft and re-saved the card.
  const savePicks = async () => {
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
      setSaveMsg(res.ok ? "Picks saved ✓" : (data.error ?? "Could not save your picks."));
    } catch {
      setSaveMsg("You're offline — picks are kept on this device.");
    }
  };

  const matches = useMemo(() => pairingsFor(), []);
  const picks = state.predictions;
  const predicted = Object.keys(picks).length;

  const tally = useMemo(() => {
    const europe = Object.values(picks).filter((p) => p === "europe").length;
    const usa = Object.values(picks).filter((p) => p === "usa").length;
    const halves = Object.values(picks).filter((p) => p === "half").length;
    return {
      europe: europe + halves * 0.5,
      usa: usa + halves * 0.5,
      halves,
    };
  }, [picks]);

  const awardsPicked = AWARDS.filter((a) => state.awards[a.key]).length;
  const potential = predicted * 2 + awardsPicked * 5 + (predicted === 28 ? 10 : 0);
  const sessionMatches = matches.filter((m) => m.sessionIndex === activeSession);
  const session = SESSIONS[activeSession];

  const autoPredict = () => {
    matches.forEach((match) => {
      const e = match.europe.reduce((s, id) => s + PLAYER_BY_ID[id].projected, 0);
      const u = match.usa.reduce((s, id) => s + PLAYER_BY_ID[id].projected, 0);
      const gap = e - u;
      const pick: Pick = Math.abs(gap) < 6 ? "half" : gap > 0 ? "europe" : "usa";
      setPrediction(match.id, pick);
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>The match predictor</Eyebrow>
          <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Call all twenty-eight</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-cream/70">
            Before the captains have even swapped cards, pick a winner for all 28 matches — plus MVP,
            top scorer and rookie of the week. Picks lock with your card at the first tee.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={autoPredict}
            className="rounded-full border border-white/20 px-4 py-2 text-[12.5px] font-medium text-cream/80 transition hover:border-gold/60 hover:text-gold-soft"
          >
            Favourites auto-pick
          </button>
          <button
            type="button"
            onClick={clearPredictions}
            className="rounded-full border border-white/12 px-4 py-2 text-[12.5px] text-cream/70 transition hover:border-usa/40 hover:text-usa"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {/* session tabs */}
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {SESSIONS.map((s, index) => {
              const done = matches
                .filter((m) => m.sessionIndex === index)
                .every((m) => picks[m.id]);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSession(index)}
                  aria-pressed={activeSession === index}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-[12px] transition ${
                    activeSession === index
                      ? "border-gold/50 bg-gold/10 text-gold-soft"
                      : "border-white/10 text-cream/70 hover:border-white/25 hover:text-cream"
                  }`}
                >
                  {s.day.replace(" 2027", "")} · {s.label}
                  {done ? <span className="ml-1.5 text-shamrock">✓</span> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-xl text-cream">
              {session.day} · {session.label}
            </h2>
            <span className="text-[11px] text-cream/60">
              {session.points} cup points · projected pairings
            </span>
          </div>

          <div className={`mt-3 grid gap-3 ${session.format === "singles" ? "sm:grid-cols-2" : ""}`}>
            {sessionMatches.map((match) => {
              const pick = picks[match.id];
              return (
                <div
                  key={match.id}
                  className={`rounded-xl border p-3.5 transition ${
                    pick ? "border-gold/35 bg-gold/[0.05]" : "border-white/10 bg-white/[0.025]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-cream/60">
                    <span>Match {match.no}</span>
                    <span>
                      {match.format === "singles" ? "Singles" : match.format === "fourball" ? "Fourball" : "Foursomes"}
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1">
                    <PairLine ids={match.europe} side="europe" active={pick === "europe"} />
                    <PairLine ids={match.usa} side="usa" active={pick === "usa"} />
                  </div>

                  <div
                    role="group"
                    aria-label={`Match ${match.no}: ${match.europe.map((id) => PLAYER_BY_ID[id].name).join(" and ")} against ${match.usa.map((id) => PLAYER_BY_ID[id].name).join(" and ")}`}
                    className="mt-3 grid grid-cols-3 gap-1.5"
                  >
                    {PICKS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPrediction(match.id, option.value)}
                        aria-pressed={pick === option.value}
                        className={`rounded-lg border py-1.5 text-[11.5px] font-medium transition ${
                          pick === option.value
                            ? option.value === "europe"
                              ? "border-europe bg-europe/20 text-cream"
                              : option.value === "usa"
                                ? "border-usa bg-usa/20 text-cream"
                                : "border-gold bg-gold/20 text-cream"
                            : "border-white/12 text-cream/70 hover:border-white/30 hover:text-cream"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* awards */}
          <div className="mt-8">
            <h2 className="text-xl text-cream">The awards</h2>
            <p className="mt-1 text-[12.5px] text-cream/70">
              Five points each if you call it. Picked from the 24 projected players.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {AWARDS.map((award) => (
                <label
                  key={award.key}
                  className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
                >
                  <span className="text-[12.5px] font-medium text-cream">{award.label}</span>
                  <span className="mt-0.5 block text-[10.5px] text-cream/60">{award.hint}</span>
                  <select
                    value={state.awards[award.key] ?? ""}
                    onChange={(e) => setAward(award.key, e.target.value || null)}
                    className="mt-3 w-full rounded-lg border border-white/12 bg-forest-950/70 px-2.5 py-2 text-[12px] text-cream focus:border-gold/50 focus:outline-none"
                  >
                    <option value="" className="bg-forest-900">
                      Pick a player
                    </option>
                    {(award.key === "rookie" ? ROOKIES.map((id) => PLAYER_BY_ID[id]) : PLAYERS).map(
                      (player) => (
                        <option key={player.id} value={player.id} className="bg-forest-900">
                          {player.name} · {player.side === "europe" ? "EUR" : "USA"}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-cream/60">
            Pairings are projected from the qualifying model. When Donald and Furyk name their sides
            on 22 August 2027, the predictor re-draws with the real twelve — your picks carry over
            where the match-ups survive, and you get a free transfer for any card pick that drops out.
          </p>
        </div>

        {/* sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-white/12 bg-forest-900/70 p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-cream/60">Your call</p>
              <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] text-cream/70 tnum">
                {predicted}/28
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-forest-950/50 p-4">
              <p className="text-[9.5px] uppercase tracking-[0.16em] text-cream/60">Predicted cup</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-display text-3xl text-europe tnum">
                  {formatScore(tally.europe)}
                </span>
                <span className="text-cream/60">–</span>
                <span className="font-display text-3xl text-usa tnum">
                  {formatScore(tally.usa)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-cream/60">
                {tally.halves} halves · {28 - predicted} matches left to call
              </p>
            </div>

            <div className="mt-4 space-y-2 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-cream/70">Match picks</span>
                <span className="tnum text-cream/85">{predicted} × 2 pts</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-cream/70">Awards</span>
                <span className="tnum text-cream/85">{awardsPicked} × 5 pts</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-cream/70">Exact scoreline</span>
                <span className="tnum text-cream/85">+10</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                <span className="text-cream/70">Points in play</span>
                <span className="font-display text-lg text-gold-soft tnum">{potential}</span>
              </div>
            </div>

            {paid ? (
              <button
                type="button"
                onClick={savePicks}
                className="mt-4 block w-full rounded-full border border-gold/50 py-2.5 text-center text-[12.5px] font-semibold text-gold-soft transition hover:bg-gold/10"
              >
                Save my picks
              </button>
            ) : null}
            {saveMsg ? (
              <p role="status" className="mt-2 text-center text-[11px] text-cream/60">
                {saveMsg}
              </p>
            ) : null}

            <Link
              href="/live"
              className="mt-4 block rounded-full bg-gold py-2.5 text-center text-[12.5px] font-semibold text-forest-950 transition hover:bg-gold-soft"
            >
              Watch the cup live →
            </Link>

            <p className="mt-3 text-[10.5px] leading-relaxed text-cream/60">
              Your card and your calls travel together. One payment covers both games.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="eyebrow text-cream/60">How it scores</p>
            <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-cream/70">
              <li>
                <span className="text-cream/75">+2</span> for each match you call correctly.
              </li>
              <li>
                <span className="text-cream/75">+5</span> per award.
              </li>
              <li>
                <span className="text-cream/75">+10</span> for the exact final scoreline.
              </li>
              <li>Halves count for you if you picked “halve”.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PairLine({ ids, side, active }: { ids: string[]; side: "europe" | "usa"; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: SIDE_COLOR[side] }}
      />
      <span className={`truncate text-[12.5px] ${active ? "text-cream" : "text-cream/65"}`}>
        {ids.map((id) => PLAYER_BY_ID[id].shortName).join(" / ")}
      </span>
    </div>
  );
}

function formatScore(n: number): string {
  const whole = Math.floor(n);
  const half = n % 1 !== 0;
  if (whole === 0 && half) return "½";
  return half ? `${whole}½` : String(whole);
}
