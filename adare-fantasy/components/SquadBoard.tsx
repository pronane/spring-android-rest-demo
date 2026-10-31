"use client";

import Link from "next/link";
import { PLAYER_BY_ID, SQUAD_SIZE, type Player } from "@/lib/data";
import { credits } from "@/lib/helpers";
import { CountryChip, TeamDot } from "./ui";

export function SquadBoard({
  squad,
  captain,
  onCaptain,
  onRemove,
  variant = "compact",
}: {
  squad: string[];
  captain: string | null;
  onCaptain?: (id: string) => void;
  onRemove?: (id: string) => void;
  variant?: "compact" | "full";
}) {
  return (
    <ol className="space-y-2">
      {Array.from({ length: SQUAD_SIZE }).map((_, index) => {
        const id = squad[index];
        const player: Player | undefined = id ? PLAYER_BY_ID[id] : undefined;
        const isCaptain = player && captain === player.id;

        if (!player) {
          return (
            <li
              key={`empty-${index}`}
              className="flex h-[62px] items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.015] px-3"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-[11px] text-cream/30 tnum">
                {index + 1}
              </span>
              <span className="text-[13px] text-cream/30">Empty slot</span>
            </li>
          );
        }

        return (
          <li
            key={player.id}
            className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
              isCaptain
                ? "border-gold/45 bg-gold/[0.07]"
                : "border-white/10 bg-white/[0.03] hover:border-white/20"
            }`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/15 font-display text-[12px] text-cream/60 tnum">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <TeamDot side={player.side} size={7} />
                <p className="truncate text-[13.5px] font-medium text-cream">{player.name}</p>
                {isCaptain ? (
                  <span className="rounded bg-gold px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.12em] text-forest-950">
                    C
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-cream/40">
                <CountryChip code={player.countryCode} />
                <span className="tnum">{credits(player.price)}m</span>
                {variant === "full" ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tnum">{player.projected} proj</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {onCaptain ? (
                <button
                  type="button"
                  onClick={() => onCaptain(player.id)}
                  title="Make captain — points doubled"
                  className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                    isCaptain
                      ? "border-gold bg-gold text-forest-950"
                      : "border-white/15 text-cream/50 hover:border-gold/50 hover:text-gold-soft"
                  }`}
                >
                  C
                </button>
              ) : null}
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(player.id)}
                  aria-label={`Remove ${player.name}`}
                  className="grid h-6 w-6 place-items-center rounded-full text-cream/35 transition hover:bg-white/10 hover:text-cream"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function BudgetBar({ spend, budget = 100 }: { spend: number; budget?: number }) {
  const pct = Math.min(100, (spend / budget) * 100);
  const over = spend > budget;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow text-cream/40">Budget spent</span>
        <span className={`tnum text-sm ${over ? "text-usa" : "text-cream/80"}`}>
          {credits(spend)} / {budget}m
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            over ? "bg-usa" : pct > 92 ? "bg-gold" : "bg-shamrock"
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function SquadEmpty({ label = "No team yet" }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-6 text-center">
      <p className="font-display text-lg text-cream/80">{label}</p>
      <p className="mx-auto mt-2 max-w-xs text-[13px] text-cream/45">
        Pick six players within a 100m budget and name one captain. Takes about ninety seconds.
      </p>
      <Link
        href="/draft"
        className="mt-4 inline-flex rounded-full bg-gold px-4 py-2 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
      >
        Draft your six
      </Link>
    </div>
  );
}
