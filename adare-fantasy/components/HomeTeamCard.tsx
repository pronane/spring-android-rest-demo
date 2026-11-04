"use client";

import Link from "next/link";
import { LEAGUES, PLAYER_BY_ID } from "@/lib/data";
import { credits } from "@/lib/helpers";
import { useFantasy } from "@/lib/store";
import { TeamDot } from "./ui";
import { SquadEmpty } from "./SquadBoard";

export function HomeTeamCard() {
  const { state, projected, spend, ready, mode } = useFantasy();
  const hasTeam = state.squad.length > 0;

  if (!hasTeam) {
    return <SquadEmpty label="Your card is empty" />;
  }

  const league = LEAGUES[0];
  const rank =
    1 +
    league.members.filter((m) => m.points > projected).length;

  return (
    <div className="panel grain relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-ink-soft">Your card</p>
          <h3 className="mt-1.5 font-display text-2xl text-ink">{state.teamName || "Untitled"}</h3>
          <p className="text-[12px] text-ink-soft">
            {state.manager || "You"} · {mode.name} · {state.joinedLeagues.length} league
            {state.joinedLeagues.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
          {state.isDemo ? "Demo card" : "Saved"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-line bg-paper/50 p-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-ink-soft">Projected</p>
          <p className="tnum font-display text-xl text-accent">
            {ready ? projected.toFixed(1) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-ink-soft">League rank</p>
          <p className="tnum font-display text-xl text-ink">
            {rank}
            <span className="text-[11px] text-ink-soft">/{league.members.length + 1}</span>
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-ink-soft">Spent</p>
          <p className="tnum font-display text-xl text-ink">{credits(spend)}m</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {state.squad.map((id) => {
          const player = PLAYER_BY_ID[id];
          if (!player) return null;
          const isCaptain = state.captain === id;
          return (
            <li key={id} className="flex items-center gap-2 text-[12.5px]">
              <TeamDot side={player.side} size={6} />
              <span className={`flex-1 truncate ${isCaptain ? "text-ink" : "text-ink-soft"}`}>
                {player.name}
              </span>
              {isCaptain ? (
                <span className="rounded bg-butter px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink">
                  C
                </span>
              ) : (
                <span className="tnum text-[11px] text-ink-soft">{credits(player.price)}m</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex gap-2">
        <Link
          href="/team"
          className="flex-1 rounded-full bg-mint px-4 py-2 text-center text-[12.5px] font-semibold text-ink transition hover:bg-mint-deep"
        >
          View my team
        </Link>
        <Link
          href="/draft"
          className="rounded-full border border-ink/20 px-4 py-2 text-[12.5px] font-medium text-ink/80 transition hover:border-accent/50 hover:text-accent"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}
