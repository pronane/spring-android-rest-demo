"use client";

import { SIDE_COLOR, type FormResult, type Player } from "@/lib/data";
import { credits } from "@/lib/helpers";
import { CountryChip, TeamDot } from "./ui";

const FORM_STYLE: Record<FormResult, string> = {
  W: "bg-shamrock/20 text-shamrock border-shamrock/30",
  H: "bg-white/[0.06] text-cream/60 border-white/15",
  L: "bg-usa/15 text-usa border-usa/25",
};

export function PlayerTile({
  player,
  selected,
  onToggle,
  blockedReason,
  actionLabel,
}: {
  player: Player;
  selected: boolean;
  onToggle: () => void;
  blockedReason?: string;
  actionLabel?: string;
}) {
  const initials = player.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl border p-3.5 transition ${
        selected
          ? "border-gold/50 bg-gold/[0.06]"
          : blockedReason
            ? "border-white/[0.07] bg-white/[0.015] opacity-85"
            : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: SIDE_COLOR[player.side], opacity: selected ? 1 : 0.55 }}
      />

      <div className="flex items-center justify-between gap-2 pl-2">
        <span className="flex items-center gap-2">
          <TeamDot side={player.side} size={7} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream/70">
            {player.side === "europe" ? "Europe" : "USA"}
          </span>
        </span>
        <span className="tnum text-[10px] uppercase tracking-[0.1em] text-cream/60">
          WR #{player.worldRank}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 pl-2">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/12 font-display text-[13px] text-cream/85"
          style={{
            background: `radial-gradient(circle at 30% 25%, ${SIDE_COLOR[player.side]}33, rgba(255,255,255,0.03))`,
          }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-cream">{player.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <CountryChip code={player.countryCode} />
            <span className="truncate text-[10.5px] text-cream/60">{player.role}</span>
          </div>
          <p className="mt-1 text-[10.5px] text-cream/70 sm:hidden">
            <span className="tnum text-cream/75">{credits(player.price)}m</span> · {player.projected} proj ·{" "}
            {player.ownership}% owned
          </p>
        </div>
      </div>

      <div className="mt-3 hidden grid-cols-3 divide-x divide-white/10 sm:grid rounded-lg border border-white/[0.08] bg-forest-950/40 py-2 pl-2 text-center">
        <div>
          <p className="tnum font-display text-[15px] text-cream">{credits(player.price)}m</p>
          <p className="text-[9px] uppercase tracking-[0.12em] text-cream/60">Price</p>
        </div>
        <div>
          <p className="tnum font-display text-[15px] text-gold-soft">{player.projected}</p>
          <p className="text-[9px] uppercase tracking-[0.12em] text-cream/60">Proj</p>
        </div>
        <div>
          <p className="tnum font-display text-[15px] text-cream">{player.ownership}%</p>
          <p className="text-[9px] uppercase tracking-[0.12em] text-cream/60">Owned</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 pl-2">
        <span className="text-[9px] uppercase tracking-[0.14em] text-cream/60">Form</span>
        {player.form.map((result, i) => (
          <span
            key={i}
            className={`grid h-4 w-4 place-items-center rounded border text-[9px] font-semibold ${FORM_STYLE[result]}`}
          >
            {result}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={Boolean(blockedReason)}
        className={`mt-3 ml-2 flex w-[calc(100%-0.5rem)] items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-semibold transition ${
          selected
            ? "bg-gold text-forest-950 hover:bg-gold-soft"
            : blockedReason
              ? "cursor-not-allowed border border-white/10 text-cream/60"
              : "border border-cream/20 text-cream hover:border-gold/60 hover:text-gold-soft"
        }`}
      >
        {selected ? (
          <>
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 6.4 4.7 9 10 3.4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </svg>
            In your six
          </>
        ) : blockedReason ? (
          blockedReason
        ) : (
          (actionLabel ?? "Add to squad")
        )}
      </button>
    </article>
  );
}
