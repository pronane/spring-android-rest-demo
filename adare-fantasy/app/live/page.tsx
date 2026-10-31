"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { ConditionsCard } from "@/components/ConditionsCard";
import { LEAGUES, PLAYER_BY_ID, SIDE_COLOR } from "@/lib/data";
import { useFantasy } from "@/lib/store";
import {
  SESSIONS,
  SIM_END,
  rivalProgress,
  scoreSquad,
  simState,
  type LiveMatch,
} from "@/lib/sim";
import { ACTIVE_EDITION } from "@/lib/tournaments";

const DEFAULT_MINUTE = 3080; // Sunday singles, mid-afternoon
const JUMPS = [
  { label: "Fri foursomes", minute: 140 },
  { label: "Fri fourball", minute: 430 },
  { label: "Sat foursomes", minute: 1580 },
  { label: "Sat fourball", minute: 1880 },
  { label: "Sun singles", minute: 3080 },
  { label: "Final putt", minute: SIM_END },
];

export default function LivePage() {
  const { state, mode, projected } = useFantasy();
  const [minute, setMinute] = useState(DEFAULT_MINUTE);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const t = Number(new URLSearchParams(window.location.search).get("t"));
    if (Number.isFinite(t) && t >= 0) setMinute(Math.min(SIM_END, t));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setMinute((m) => {
        if (m >= SIM_END) {
          setPlaying(false);
          return SIM_END;
        }
        return Math.min(SIM_END, m + 4 * speed);
      });
    }, 350);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  const sim = useMemo(() => simState(minute), [minute]);
  const score = useMemo(
    () => scoreSquad(state.squad, state.captain, state.mode, sim),
    [state.squad, state.captain, state.mode, sim],
  );

  const league = LEAGUES[0];
  const table = useMemo(() => {
    const rivals = league.members.map((m, i) => ({
      ...m,
      points: rivalProgress(m.points, sim, i + 11),
      isYou: false,
    }));
    const you = {
      manager: state.manager || "You",
      team: state.teamName || "Your card",
      points: score.total,
      isYou: true,
    };
    return [...rivals, you].sort((a, b) => b.points - a.points);
  }, [league.members, sim, score.total, state.manager, state.teamName]);

  const rank = table.findIndex((row) => row.isYou) + 1;
  const sessionMatches = sim.matches.filter(
    (m) => m.sessionIndex === Math.max(0, sim.sessionIndex),
  );
  const cupDecided = sim.cup.europe >= 14 || sim.cup.usa > 14;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-usa/40 bg-usa/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-usa">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-usa opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-usa" />
              </span>
              Live
            </span>
            <span className="text-[11px] text-cream/60">
              {ACTIVE_EDITION.name} · {ACTIVE_EDITION.venue}
            </span>
          </div>
          <h1 className="mt-3 text-4xl text-cream sm:text-5xl">{sim.heading}</h1>
          <p className="mt-1.5 tnum text-[13px] text-cream/70">
            {sim.clock} · {sim.completed}/28 matches complete · {sim.cup.inPlay} in play
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause the simulation" : "Play the simulation"}
              className="flex items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-[12px] font-semibold text-forest-950 transition hover:bg-gold-soft"
            >
              {playing ? "❙❙ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMinute(0);
                setPlaying(false);
              }}
              className="rounded-full px-3 py-1.5 text-[12px] text-cream/60 transition hover:text-cream"
            >
              Restart
            </button>
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                aria-label={`Playback speed ${s} times`}
                className={`rounded-full px-2.5 py-1.5 text-[11px] tnum transition ${
                  speed === s ? "bg-white/10 text-cream" : "text-cream/60 hover:text-cream"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-1 text-[10.5px] text-cream/60 sm:flex">
            {JUMPS.map((jump) => (
              <button
                key={jump.label}
                type="button"
                onClick={() => {
                  setMinute(jump.minute);
                  setPlaying(false);
                }}
                aria-current={Math.abs(minute - jump.minute) < 60 ? "true" : undefined}
                aria-label={`Jump to ${jump.label}`}
                className={`rounded-full px-2 py-1 transition hover:text-gold-soft ${
                  Math.abs(minute - jump.minute) < 60 ? "text-gold-soft" : ""
                }`}
              >
                {jump.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* scoreboard */}
      <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/12 bg-white/[0.08] sm:grid-cols-[1fr_auto_1fr]">
        <ScoreSide side="europe" points={sim.cup.europe} aligned="left" />
        <div className="flex flex-col items-center justify-center bg-forest-900 px-6 py-4">
          <p className="text-[9px] uppercase tracking-[0.18em] text-cream/60">Cup score</p>
          <p className="font-display text-lg text-cream/70">
            {sim.cup.europe % 1 === 0 ? sim.cup.europe : sim.cup.europe.toFixed(1)}
            <span className="mx-2 text-cream/60">–</span>
            {sim.cup.usa % 1 === 0 ? sim.cup.usa : sim.cup.usa.toFixed(1)}
          </p>
          <p className="mt-1 text-[10px] text-cream/60">
            {cupDecided ? "Cup decided" : `${sim.cup.remaining} points to play for`}
          </p>
        </div>
        <ScoreSide side="usa" points={sim.cup.usa} aligned="right" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* matches */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl text-cream">
              {sim.session ? `${sim.session.day} · ${sim.session.label}` : "First tee"}
            </h2>
            <span className="text-[11px] text-cream/60 tnum">
              Session {Math.max(1, sim.sessionIndex + 1)} of 5
            </span>
          </div>

          <div
            className={`grid gap-3 ${
              sessionMatches.length > 6 ? "sm:grid-cols-2" : ""
            }`}
          >
            {sessionMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {SESSIONS.map((session, index) => {
              const done = index < sim.sessionIndex;
              const active = index === sim.sessionIndex;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    setMinute(session.startMin + Math.round((session.endMin - session.startMin) * 0.6));
                    setPlaying(false);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                    active
                      ? "border-gold/50 bg-gold/10 text-gold-soft"
                      : done
                        ? "border-white/10 text-cream/70"
                        : "border-white/10 text-cream/60 hover:border-white/25"
                  }`}
                >
                  {session.day.replace(" 2027", "")} {session.label}
                  {done ? " ✓" : ""}
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-cream/60">Wire</p>
              <span className="text-[10px] text-cream/60">every birdie, as it lands</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {sim.feed.length === 0 ? (
                <li className="text-[12px] text-cream/60">
                  No holes completed yet. Press play.
                </li>
              ) : (
                sim.feed.map((event, i) => (
                  <li
                    key={`${event.text}-${i}`}
                    className="flex items-center gap-2 text-[12px] text-cream/60"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: SIDE_COLOR[event.side] }}
                    />
                    <span className="flex-1">{event.text}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow text-cream/60">Your live points</p>
                <p className="mt-1 font-display text-4xl text-gold-soft tnum">
                  {score.total.toFixed(1)}
                </p>
                <p className="mt-1 text-[11.5px] text-cream/70">
                  {rank === 1 ? "Leading" : `${rank}${rank === 2 ? "nd" : rank === 3 ? "rd" : "th"}`}{" "}
                  in {league.name} · {state.teamName || "your card"}
                </p>
              </div>
              <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-cream/70">
                {mode.short} · {state.squad.length}/{mode.squadSize}
              </span>
            </div>

            {state.squad.length === 0 ? (
              <Link
                href="/draft"
                className="mt-4 block rounded-full bg-gold py-2 text-center text-[12.5px] font-semibold text-forest-950"
              >
                Draft a card to score live
              </Link>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {score.players.slice(0, 8).map((row) => {
                  const player = PLAYER_BY_ID[row.playerId];
                  const isCaptain = state.captain === row.playerId;
                  return (
                    <li key={row.playerId} className="flex items-center gap-2 text-[12px]">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: SIDE_COLOR[player.side] }}
                      />
                      <span className="flex-1 truncate text-cream/75">
                        {player.shortName}
                        {isCaptain ? (
                          <span className="ml-1 rounded bg-gold px-1 text-[8px] font-bold text-forest-950">
                            C
                          </span>
                        ) : null}
                      </span>
                      {row.inPlay > 0 ? (
                        <span className="rounded bg-usa/15 px-1.5 py-0.5 text-[9px] text-usa">
                          {row.inPlay} live
                        </span>
                      ) : null}
                      <span className="tnum w-10 text-right text-cream/85">
                        {row.total.toFixed(0)}
                      </span>
                    </li>
                  );
                })}
                {score.players.length > 8 ? (
                  <li className="pt-1 text-[11px] text-cream/60">
                    + {score.players.length - 8} more on your card
                  </li>
                ) : null}
              </ul>
            )}
            <p className="mt-3 border-t border-white/10 pt-2.5 text-[10.5px] text-cream/60">
              Projected pre-event: {projected.toFixed(0)} pts. Points land when a match finishes.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow text-cream/60">Live table</p>
                <p className="mt-1 text-[15px] text-cream">{league.name}</p>
              </div>
              <span className="rounded-lg border border-gold/30 bg-gold/[0.07] px-2 py-1 text-[10px] tracking-[0.12em] text-gold-soft">
                {league.code}
              </span>
            </div>
            <ul className="mt-3 space-y-1">
              {table.slice(0, 6).map((row, i) => (
                <li
                  key={row.team + i}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] ${
                    row.isYou ? "bg-gold/10" : ""
                  }`}
                >
                  <span className="w-4 text-[10px] text-cream/60 tnum">{i + 1}</span>
                  <span className="flex-1 truncate text-cream/80">{row.team}</span>
                  <span className="tnum text-cream/85">{row.points.toFixed(1)}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/leagues"
              className="mt-2 inline-block text-[11px] text-gold-soft/80 hover:text-gold"
            >
              Full league →
            </Link>
          </div>

          <ConditionsCard compact />
        </div>
      </div>
    </div>
  );
}

function ScoreSide({
  side,
  points,
  aligned,
}: {
  side: "europe" | "usa";
  points: number;
  aligned: "left" | "right";
}) {
  return (
    <div className="flex items-center justify-between bg-forest-900 px-5 py-4">
      <div className={aligned === "right" ? "order-2 text-right" : ""}>
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cream/70">
          <span className="h-2 w-2 rounded-full" style={{ background: SIDE_COLOR[side] }} />
          {side === "europe" ? "Europe" : "United States"}
        </p>
        <p className="mt-1 font-display text-4xl text-cream tnum">
          {points % 1 === 0 ? points : points.toFixed(1)}
        </p>
      </div>
      <span className="text-[10px] text-cream/60">{aligned === "left" ? "holders" : "challengers"}</span>
    </div>
  );
}

function MatchCard({ match }: { match: LiveMatch }) {
  const europe = match.europe.map((id) => PLAYER_BY_ID[id].shortName).join(" / ");
  const usa = match.usa.map((id) => PLAYER_BY_ID[id].shortName).join(" / ");
  const resultLabel =
    match.status === "final"
      ? match.result === "half"
        ? "Halved"
        : match.result === "europe"
          ? "Europe win"
          : "USA win"
      : match.status === "live"
        ? `Hole ${Math.max(1, match.holesPlayed)}`
        : "Tee time soon";
  const tone =
    match.status === "final"
      ? match.result === "europe"
        ? "border-europe/40 bg-europe/[0.07]"
        : match.result === "usa"
          ? "border-usa/40 bg-usa/[0.07]"
          : "border-white/15 bg-white/[0.04]"
      : match.status === "live"
        ? "border-usa/30 bg-usa/[0.04]"
        : "border-white/10 bg-white/[0.02]";

  return (
    <div className={`rounded-xl border p-3.5 ${tone}`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-cream/60">
        <span>
          Match {match.no} · {match.format === "singles" ? "Singles" : match.format === "fourball" ? "Fourball" : "Foursomes"}
        </span>
        <span
          className={
            match.status === "live" ? "text-usa" : match.status === "final" ? "text-cream/70" : ""
          }
        >
          {resultLabel}
          {match.status === "final" ? ` · ${match.margin}` : ""}
        </span>
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SIDE_COLOR.europe }} />
          <span className={`flex-1 truncate ${match.leader === "europe" ? "text-cream" : "text-cream/70"}`}>
            {europe}
          </span>
          {match.leader === "europe" ? (
            <span className="text-[10px] font-semibold uppercase text-europe">up</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SIDE_COLOR.usa }} />
          <span className={`flex-1 truncate ${match.leader === "usa" ? "text-cream" : "text-cream/70"}`}>
            {usa}
          </span>
          {match.leader === "usa" ? (
            <span className="text-[10px] font-semibold uppercase text-usa">up</span>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(match.holesPlayed / 18) * 100}%`,
            // The bar is holes played, not the lead — colour stays neutral so
            // it can never contradict the "up" marker beside a name.
            background:
              match.status === "final"
                ? "linear-gradient(90deg,#c9a44c,#e6cd94)"
                : "linear-gradient(90deg,rgba(201,164,76,0.55),rgba(201,164,76,0.9))",
          }}
        />
      </div>
    </div>
  );
}
