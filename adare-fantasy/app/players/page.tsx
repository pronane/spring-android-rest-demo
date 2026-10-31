"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerTile } from "@/components/PlayerTile";
import { Eyebrow, TeamDot } from "@/components/ui";
import { PLAYERS, type Side } from "@/lib/data";
import { credits, spendOf } from "@/lib/helpers";
import { useFantasy } from "@/lib/store";

type SideFilter = "all" | Side;
type SortKey = "price" | "projected" | "ownership" | "rank" | "value";

export default function PlayersPage() {
  const { state, togglePlayer, projected, remaining, spend, mode } = useFantasy();
  const [side, setSide] = useState<SideFilter>("all");
  const [sort, setSort] = useState<SortKey>("price");
  const [query, setQuery] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);

  const europeCount = state.squad.filter((id) => PLAYERS.find((p) => p.id === id)?.side === "europe").length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = PLAYERS.filter((p) => (side === "all" ? true : p.side === side))
      .filter((p) => (onlyPicked ? state.squad.includes(p.id) : true))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            p.country.toLowerCase().includes(q) ||
            p.countryCode.toLowerCase().includes(q)
          : true,
      );
    return list.sort((a, b) => {
      switch (sort) {
        case "projected":
          return b.projected - a.projected;
        case "ownership":
          return b.ownership - a.ownership;
        case "rank":
          return a.worldRank - b.worldRank;
        case "value":
          return b.projected / b.price - a.projected / a.price;
        default:
          return b.price - a.price;
      }
    });
  }, [side, sort, query, onlyPicked, state.squad]);

  const blockedFor = (id: string): string | undefined => {
    if (state.squad.includes(id)) return undefined;
    if (state.squad.length >= mode.squadSize) return "Card full";
    const player = PLAYERS.find((p) => p.id === id)!;
    const sameSide = player.side === "europe" ? europeCount : state.squad.length - europeCount;
    if (sameSide >= mode.maxPerSide) return `Max ${mode.maxPerSide} per side`;
    if (spendOf(state.squad) + player.price > mode.budget) return "Over budget";
    return undefined;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>The pool · 24 projected players</Eyebrow>
          <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Scout the field</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-cream/55">
            Every projected player on both sides, priced by the model. Tap a card to add him to
            your {mode.name} card — draft from here or from the draft room.
          </p>
        </div>
        <Link
          href="/draft"
          className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
        >
          Go to draft room
        </Link>
      </div>

      <div className="sticky top-16 z-30 mt-6 -mx-4 border-y border-white/10 bg-forest-950/92 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[180px] flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/30"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players or nations"
              className="w-full rounded-full border border-white/12 bg-white/[0.04] py-2 pl-9 pr-3 text-[13px] text-cream placeholder:text-cream/30 focus:border-gold/50 focus:outline-none"
            />
          </div>
          <div className="flex rounded-full border border-white/12 bg-white/[0.03] p-0.5">
            {(["all", "europe", "usa"] as SideFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  side === option ? "bg-cream text-forest-900" : "text-cream/55 hover:text-cream"
                }`}
              >
                {option === "all" ? "All" : option === "europe" ? "Europe" : "USA"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-[12px] text-cream/55">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent text-[12px] text-cream focus:outline-none"
            >
              <option value="price" className="bg-forest-900">Price</option>
              <option value="projected" className="bg-forest-900">Projected</option>
              <option value="ownership" className="bg-forest-900">Owned</option>
              <option value="rank" className="bg-forest-900">World rank</option>
              <option value="value" className="bg-forest-900">Value</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setOnlyPicked((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
              onlyPicked
                ? "border-gold/50 bg-gold/15 text-gold-soft"
                : "border-white/20 text-cream/60 hover:text-cream"
            }`}
          >
            In my squad
          </button>
          <div className="ml-auto flex items-center gap-4 text-[12px] text-cream/55">
            <span className="flex items-center gap-1.5">
              <TeamDot side="europe" size={6} /> {europeCount}
              <span className="text-cream/25">/</span>
              <TeamDot side="usa" size={6} /> {state.squad.length - europeCount}
            </span>
            <span className="tnum">
              <span className="text-cream/85">{credits(remaining)}m</span> left ·{" "}
              {projected.toFixed(0)} proj
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((player) => (
          <PlayerTile
            key={player.id}
            player={player}
            selected={state.squad.includes(player.id)}
            blockedReason={blockedFor(player.id)}
            onToggle={() => togglePlayer(player.id)}
          />
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-cream/40">
          No players match. Clear the search or tap “In my squad” again.
        </p>
      ) : null}

      <p className="mt-8 text-[11px] text-cream/30">
        Spend so far {credits(spend)}m of {mode.budget}m. Prices are projections and will re-price
        when the sides are named.
      </p>
    </div>
  );
}
