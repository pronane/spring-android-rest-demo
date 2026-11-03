"use client";

import Link from "next/link";
import { LeagueTable } from "@/components/LeagueTable";
import { SquadBoard, BudgetBar } from "@/components/SquadBoard";
import { Eyebrow, Stat, TeamDot } from "@/components/ui";
import { GLOBAL_TOP, LEAGUES, PLAYER_BY_ID, SCORING, type LeagueMember } from "@/lib/data";
import { credits } from "@/lib/helpers";
import { useFantasy } from "@/lib/store";

export default function TeamPage() {
  const {
    state,
    mode,
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
    paid,
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

  const picks = Object.values(state.predictions);
  const predictedCount = picks.length;
  const pickEurope = picks.filter((p) => p === "europe").length + picks.filter((p) => p === "half").length * 0.5;
  const pickUsa = picks.filter((p) => p === "usa").length + picks.filter((p) => p === "half").length * 0.5;
  const awardCount = Object.values(state.awards).filter(Boolean).length;

  if (!hasTeam) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <Eyebrow>My team</Eyebrow>
        <h1 className="mt-3 text-4xl text-ink">No card on file</h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-ink-soft">
          You have not drafted a card yet. Six players on {credits(100)}m — or a full dozen on 200m
          — and one captain. It takes about ninety seconds.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/draft"
            className="rounded-full bg-butter px-5 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-butter-deep"
          >
            Draft your card
          </Link>
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-full border border-ink/20 px-5 py-2.5 text-[13px] font-medium text-ink-soft transition hover:border-accent/50 hover:text-accent"
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
          <h1 className="mt-2 text-4xl text-ink sm:text-5xl">{state.teamName || "Untitled"}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
            <span>{state.manager || "No manager name"}</span>
            <span aria-hidden>·</span>
            <span>{mode.name}</span>
            <span aria-hidden>·</span>
            <span>Locks Fri 17 Sep · 07:35 IST</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.isDemo ? (
            <span className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Demo card
            </span>
          ) : (
            <span className="rounded-full border border-sage/35 bg-sage/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sage">
              Saved
            </span>
          )}
          <Link
            href="/team/transfers"
            className="rounded-full border border-ink/20 px-4 py-2 text-[12.5px] font-medium text-ink/80 transition hover:border-accent/50 hover:text-accent"
          >
            Transfers &amp; armband
          </Link>
          <button
            type="button"
            onClick={resetTeam}
            className="rounded-full border border-ink/12 px-4 py-2 text-[12.5px] text-ink-soft transition hover:border-clay/40 hover:text-clay"
          >
            Start fresh
          </button>
        </div>
      </div>

      {!paid ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/35 bg-accent/[0.07] px-4 py-3">
          <p className="text-[12.5px] text-ink-soft">
            This card is a draft. Pay the €10 entry to lock it in and appear on league tables.
          </p>
          <Link
            href="/enter"
            className="rounded-full bg-butter px-4 py-1.5 text-[12px] font-semibold text-ink"
          >
            Complete entry
          </Link>
        </div>
      ) : null}

      {/* STAT STRIP */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-paper-deep sm:grid-cols-3 lg:grid-cols-5">
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
            className={`bg-surface/80 px-4 py-4 ${
              index === 4 ? "col-span-2 sm:col-span-2 lg:col-span-1" : ""
            }`}
          >
            <p className="truncate text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
              {stat.label}
            </p>
            <p
              className={`mt-1.5 font-display text-2xl tnum ${
                stat.tone === "gold" ? "text-accent" : "text-ink"
              }`}
            >
              {stat.value}
            </p>
            <p className="text-[10.5px] text-ink-soft">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        {/* TEAM SHEET */}
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow text-ink-soft">Team sheet</p>
              <h2 className="mt-1 text-xl text-ink">
                {state.squad.length}/{mode.squadSize} players
              </h2>
            </div>
            <span className="rounded-full border border-ink/12 px-2.5 py-1 text-[10.5px] text-ink-soft tnum">
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
              size={mode.squadSize}
            />
          </div>

          <div className="mt-5">
            <BudgetBar spend={spend} budget={mode.budget} />
          </div>

          {errors.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {errors.map((error) => (
                <p key={error} className="rounded-lg bg-clay/10 px-3 py-2 text-[11.5px] text-clay">
                  {error}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={autoFill}
              className="rounded-full border border-ink/15 py-2 text-[12px] font-medium text-ink-soft transition hover:border-accent/50 hover:text-accent"
            >
              Auto-pick best six
            </button>
            <Link
              href="/draft"
              className="rounded-full bg-butter py-2 text-center text-[12px] font-semibold text-ink transition hover:bg-butter-deep"
            >
              Edit card
            </Link>
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="eyebrow text-ink-soft">{primary.visibility === "public" ? "Open league" : "Private league"}</p>
                <h2 className="mt-1 text-xl text-ink">{primary.name}</h2>
              </div>
              <span className="rounded-lg border border-accent/30 bg-accent/[0.08] px-3 py-1.5 text-[11px] tracking-[0.14em] text-accent">
                {primary.code}
              </span>
            </div>
            <div className="mt-4">
              <LeagueTable members={primaryMembers} dense />
            </div>
            <Link
              href="/leagues"
              className="mt-3 inline-block text-[11.5px] text-accent/80 transition hover:text-accent"
            >
              Manage leagues →
            </Link>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <p className="eyebrow text-ink-soft">Where the points come from</p>
            <h2 className="mt-1 text-xl text-ink">Captain&apos;s spread</h2>
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
                      <span className="flex items-center gap-2 text-ink/80">
                        <TeamDot side={player.side} size={6} />
                        {player.shortName}
                        {isCaptain ? (
                          <span className="rounded bg-butter px-1 text-[8px] font-bold uppercase text-ink">
                            C
                          </span>
                        ) : null}
                      </span>
                      <span className="tnum text-ink-soft">{value.toFixed(1)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(value / max) * 100}%`,
                          background: isCaptain
                            ? "linear-gradient(90deg,#866314,#c79a3a)"
                            : player.side === "europe"
                              ? "#4d78b0"
                              : "#b3644f",
                          opacity: isCaptain ? 1 : 0.75,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow text-ink-soft">Match predictor</p>
                <h2 className="mt-1 text-xl text-ink">Your call</h2>
              </div>
              <Link
                href="/predict"
                className="text-[11.5px] text-accent/80 transition hover:text-accent"
              >
                {predictedCount === 0 ? "Start calling →" : "Edit →"}
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-paper/50 px-4 py-3">
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.16em] text-ink-soft">Predicted cup</p>
                <p className="font-display text-xl text-ink tnum">
                  <span className="text-ocean">{pickEurope % 1 === 0 ? pickEurope : pickEurope.toFixed(1)}</span>
                  <span className="mx-1.5 text-ink-soft">–</span>
                  <span className="text-clay">{pickUsa % 1 === 0 ? pickUsa : pickUsa.toFixed(1)}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="tnum text-[12px] text-ink-soft">{predictedCount}/28 matches</p>
                <p className="text-[11px] text-ink-soft">{awardCount}/3 awards</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <p className="eyebrow text-ink-soft">Team details</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  Team name
                </span>
                <input
                  value={state.teamName}
                  onChange={(e) => setIdentity(state.manager, e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-ink/12 bg-paper/60 px-3 py-2 text-[13px] text-ink focus:border-accent/50 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  Manager
                </span>
                <input
                  value={state.manager}
                  onChange={(e) => setIdentity(e.target.value, state.teamName)}
                  className="mt-1.5 w-full rounded-lg border border-ink/12 bg-paper/60 px-3 py-2 text-[13px] text-ink focus:border-accent/50 focus:outline-none"
                />
              </label>
            </div>
            <p className="mt-3 text-[10.5px] text-ink-soft">
              Names appear on every league table you join. Max 22 characters — the database has
              feelings.
            </p>
          </section>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Next deadline" value="Fri 17 Sep · 07:35" sub="Free transfers until then" />
        <Stat label="Scoring starts" value="Fri 17 Sep" sub="Foursomes · 08:10 IST" />
        <Stat label="Captain multiplier" value={`×${SCORING.captainMultiplier}`} sub="Match points only" />
      </div>
    </div>
  );
}
