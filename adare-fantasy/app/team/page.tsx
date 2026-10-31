"use client";

import Link from "next/link";
import { LeagueTable } from "@/components/LeagueTable";
import { SquadBoard, BudgetBar } from "@/components/SquadBoard";
import { Eyebrow, Stat, TeamDot } from "@/components/ui";
import {
  GLOBAL_TOP,
  LEAGUES,
  PLAYER_BY_ID,
  SCORING,
  SQUAD_SIZE,
  TOURNAMENT,
  type LeagueMember,
} from "@/lib/data";
import { credits } from "@/lib/helpers";
import { useFantasy } from "@/lib/store";

export default function TeamPage() {
  const {
    state,
    projected,
    spend,
    remaining,
    setCaptain,
    togglePlayer,
    setIdentity,
    autoFill,
    resetTeam,
    loadDemo,
    errors,
    leagues,
    ready,
  } = useFantasy();

  const hasTeam = state.squad.length > 0;
  const globalRank = 1 + GLOBAL_TOP.filter((m) => m.points > projected).length;

  const myLeagues = leagues.filter((l) => state.joinedLeagues.includes(l.id));
  const primary = myLeagues[0] ?? LEAGUES[0];
  const you = (state.manager || "").trim().toLowerCase();
  const primaryMembers: LeagueMember[] = [
    ...primary.members.filter(
      (m) => !m.isYou && m.manager.trim().toLowerCase() !== you,
    ),
    ...(state.joinedLeagues.includes(primary.id) && hasTeam
      ? [
          {
            manager: state.manager || "You",
            team: state.teamName || "Your team",
            points: Number(projected.toFixed(1)),
            isYou: true,
          },
        ]
      : []),
  ].sort((a, b) => b.points - a.points);

  const primaryRank =
    1 + primaryMembers.filter((m) => !m.isYou && m.points > projected).length;

  if (!hasTeam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <Eyebrow>My team</Eyebrow>
        <h1 className="mt-3 text-4xl text-cream">No card on file</h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-cream/55">
          You have not drafted a squad yet. Six players, {credits(100)}m, one captain — it takes
          about ninety seconds and it is the only bit of admin you will do all week.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/draft"
            className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
          >
            Draft your six
          </Link>
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-full border border-white/20 px-5 py-2.5 text-[13px] font-medium text-cream/75 transition hover:border-gold/50 hover:text-gold-soft"
          >
            Load the demo card
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Eyebrow>My team · pre-season</Eyebrow>
          <h1 className="mt-2 text-4xl text-cream sm:text-5xl">{state.teamName || "Untitled"}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-cream/50">
            <span>{state.manager || "No manager name"}</span>
            <span aria-hidden>·</span>
            <span>
              {TOURNAMENT.venue}, {TOURNAMENT.village}
            </span>
            <span aria-hidden>·</span>
            <span>Locks {TOURNAMENT.deadlineLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.isDemo ? (
            <span className="rounded-full border border-gold/35 bg-gold/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-soft">
              Demo card
            </span>
          ) : (
            <span className="rounded-full border border-shamrock/35 bg-shamrock/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-shamrock">
              Saved
            </span>
          )}
          <Link
            href="/draft"
            className="rounded-full border border-white/20 px-4 py-2 text-[12.5px] font-medium text-cream/80 transition hover:border-gold/50 hover:text-gold-soft"
          >
            Make transfers
          </Link>
          <button
            type="button"
            onClick={resetTeam}
            className="rounded-full border border-white/12 px-4 py-2 text-[12.5px] text-cream/45 transition hover:border-usa/40 hover:text-usa"
          >
            Start fresh
          </button>
        </div>
      </div>

      {/* STAT STRIP */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.08] sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Projected", value: ready ? projected.toFixed(1) : "—", sub: "points", tone: "gold" as const },
          { label: "Global rank", value: `#${globalRank}`, sub: "in the open table" },
          { label: "League rank", value: `#${primaryRank}`, sub: `${primary.name}` },
          { label: "Budget left", value: `${credits(remaining)}m`, sub: `${credits(spend)}m spent` },
          {
            label: "Transfers",
            value: `${SCORING.freeTransfers}`,
            sub: `then −${SCORING.transferPenalty} pts`,
          },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={`bg-forest-900/80 px-4 py-4 ${
              index === 4 ? "col-span-2 sm:col-span-2 lg:col-span-1" : ""
            }`}
          >
            <p className="truncate text-[9.5px] uppercase tracking-[0.14em] text-cream/35">
              {stat.label}
            </p>
            <p
              className={`mt-1.5 font-display text-2xl tnum ${
                stat.tone === "gold" ? "text-gold-soft" : "text-cream"
              }`}
            >
              {stat.value}
            </p>
            <p className="text-[10.5px] text-cream/35">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        {/* TEAM SHEET */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow text-cream/40">Team sheet</p>
              <h2 className="mt-1 text-xl text-cream">
                {state.squad.length}/{SQUAD_SIZE} players
              </h2>
            </div>
            <span className="rounded-full border border-white/12 px-2.5 py-1 text-[10.5px] text-cream/50 tnum">
              {credits(spend)}m
            </span>
          </div>

          <div className="mt-4">
            <SquadBoard
              squad={state.squad}
              captain={state.captain}
              onCaptain={setCaptain}
              onRemove={togglePlayer}
              variant="full"
            />
          </div>

          <div className="mt-5">
            <BudgetBar spend={spend} />
          </div>

          {errors.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {errors.map((error) => (
                <p key={error} className="rounded-lg bg-usa/10 px-3 py-2 text-[11.5px] text-usa">
                  {error}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={autoFill}
              className="rounded-full border border-white/15 py-2 text-[12px] font-medium text-cream/75 transition hover:border-gold/50 hover:text-gold-soft"
            >
              Auto-pick best six
            </button>
            <Link
              href="/draft"
              className="rounded-full bg-gold py-2 text-center text-[12px] font-semibold text-forest-950 transition hover:bg-gold-soft"
            >
              Edit squad
            </Link>
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="eyebrow text-cream/40">{primary.visibility === "public" ? "Open league" : "Private league"}</p>
                <h2 className="mt-1 text-xl text-cream">{primary.name}</h2>
              </div>
              <span className="rounded-lg border border-gold/30 bg-gold/[0.08] px-3 py-1.5 text-[11px] tracking-[0.14em] text-gold-soft">
                {primary.code}
              </span>
            </div>
            <div className="mt-4">
              <LeagueTable members={primaryMembers} dense />
            </div>
            <Link
              href="/leagues"
              className="mt-3 inline-block text-[11.5px] text-gold-soft/80 transition hover:text-gold"
            >
              Manage leagues →
            </Link>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="eyebrow text-cream/40">Where the points come from</p>
            <h2 className="mt-1 text-xl text-cream">Captain&apos;s spread</h2>
            <ul className="mt-4 space-y-3">
              {state.squad.map((id) => {
                const player = PLAYER_BY_ID[id];
                if (!player) return null;
                const isCaptain = state.captain === id;
                const value = player.projected * (isCaptain ? 2 : 1);
                const max = Math.max(
                  ...state.squad.map((sid) => {
                    const p = PLAYER_BY_ID[sid];
                    return (p?.projected ?? 0) * (sid === state.captain ? 2 : 1);
                  }),
                );
                return (
                  <li key={id}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 text-cream/80">
                        <TeamDot side={player.side} size={6} />
                        {player.shortName}
                        {isCaptain ? (
                          <span className="rounded bg-gold px-1 text-[8px] font-bold uppercase text-forest-950">
                            C
                          </span>
                        ) : null}
                      </span>
                      <span className="tnum text-cream/55">{value.toFixed(1)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(value / max) * 100}%`,
                          background: isCaptain
                            ? "linear-gradient(90deg,#c9a44c,#e6cd94)"
                            : player.side === "europe"
                              ? "#6f9bea"
                              : "#e0776a",
                          opacity: isCaptain ? 1 : 0.75,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="eyebrow text-cream/40">Team details</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.14em] text-cream/35">
                  Team name
                </span>
                <input
                  value={state.teamName}
                  onChange={(e) => setIdentity(state.manager, e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-forest-950/60 px-3 py-2 text-[13px] text-cream focus:border-gold/50 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.14em] text-cream/35">
                  Manager
                </span>
                <input
                  value={state.manager}
                  onChange={(e) => setIdentity(e.target.value, state.teamName)}
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-forest-950/60 px-3 py-2 text-[13px] text-cream focus:border-gold/50 focus:outline-none"
                />
              </label>
            </div>
            <p className="mt-3 text-[10.5px] text-cream/30">
              Names appear on every league table you join. Max 22 characters — the database has
              feelings.
            </p>
          </section>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Next deadline" value={TOURNAMENT.deadlineLabel} sub="Free transfers until then" />
        <Stat label="Scoring starts" value="Fri 17 Sep" sub="Foursomes · 08:10 IST" />
        <Stat label="Captain multiplier" value={`×${SCORING.captainMultiplier}`} sub="Match points only" />
      </div>
    </div>
  );
}
