"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlayerTile } from "@/components/PlayerTile";
import { BudgetBar, SquadBoard } from "@/components/SquadBoard";
import { Eyebrow, TeamDot } from "@/components/ui";
import { PLAYERS, type Side } from "@/lib/data";
import { credits, spendOf } from "@/lib/helpers";
import { useFantasy } from "@/lib/store";
import { ACTIVE_EDITION, MODE_LIST, type ModeId } from "@/lib/tournaments";

type SideFilter = "all" | Side;
type SortKey = "price" | "projected" | "ownership";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "projected", label: "Projected" },
  { key: "ownership", label: "Owned" },
];

export default function DraftPage() {
  const {
    state,
    mode,
    setMode,
    togglePlayer,
    setCaptain,
    autoFill,
    saveTeam,
    clearSquad,
    spend,
    remaining,
    projected,
    errors,
    paid,
    ready,
  } = useFantasy();

  const [side, setSide] = useState<SideFilter>("all");
  const [sort, setSort] = useState<SortKey>("price");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Any change after a save makes the card unsaved again — previously the
  // button kept saying "Card saved ✓" after you swapped a player.
  useEffect(() => {
    setSaved(false);
  }, [state.squad, state.captain, state.mode]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLAYERS.filter((p) => (side === "all" ? true : p.side === side))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            p.country.toLowerCase().includes(q) ||
            p.countryCode.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => b[sort] - a[sort]);
  }, [side, sort, query]);

  const europeCount = state.squad.filter(
    (id) => PLAYERS.find((p) => p.id === id)?.side === "europe",
  ).length;
  const usaCount = state.squad.length - europeCount;
  const complete = state.squad.length === mode.squadSize && errors.length === 0;

  const blockedFor = (id: string): string | undefined => {
    if (state.squad.includes(id)) return undefined;
    if (state.squad.length >= mode.squadSize) return "Card full";
    const player = PLAYERS.find((p) => p.id === id)!;
    const sameSide = player.side === "europe" ? europeCount : usaCount;
    if (sameSide >= mode.maxPerSide) return `Max ${mode.maxPerSide} per side`;
    if (spendOf(state.squad) + player.price > mode.budget) return "Over budget";
    return undefined;
  };

  const onSave = async () => {
    setSaveError(null);
    if (!state.captain) {
      setSaveError("Pick a captain — tap C on one of your players.");
      return;
    }
    saveTeam();
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
      if (!res.ok && res.status !== 401) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(data.error ?? "Could not save your card to the server.");
        return;
      }
    } catch {
      /* offline — the card is still saved on this device */
    }
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-28 sm:px-6 lg:px-10 lg:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>The draft · {ACTIVE_EDITION.name}</Eyebrow>
          <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Build your card</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-cream/55">
            {mode.blurb} Locks {ACTIVE_EDITION.matchesLabel.split("–")[0]} at the first tee — free
            transfers until then.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.16em] text-cream/35">Projected</p>
            <p className="tnum font-display text-xl text-gold-soft">
              {ready ? projected.toFixed(1) : "—"}
            </p>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-cream/35">Left</p>
            <p className={`tnum font-display text-xl ${remaining < 0 ? "text-usa" : "text-cream"}`}>
              {credits(remaining)}m
            </p>
          </div>
        </div>
      </div>

      {/* mode switch */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {MODE_LIST.map((option) => {
          const active = option.id === state.mode;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setMode(option.id as ModeId);
                setSaved(false);
              }}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-gold/50 bg-gold/[0.07]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/25"
              }`}
            >
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border font-display text-[13px] ${
                  active
                    ? "border-gold bg-gold text-forest-950"
                    : "border-white/20 text-cream/50"
                }`}
              >
                {option.squadSize}
              </span>
              <span>
                <span className="flex items-center gap-2 text-[13.5px] font-medium text-cream">
                  {option.name}
                  {active ? (
                    <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-gold-soft">
                      Active
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-cream/45">
                  {option.tagline} · {option.budget}m budget · max {option.maxPerSide} per side
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_356px]">
        {/* pool */}
        <div>
          <div className="lg:sticky lg:top-24 lg:z-30">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:min-w-[180px] sm:flex-1">
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
                  placeholder="Search players or countries"
                  className="w-full rounded-full border border-white/12 bg-white/[0.04] py-2.5 pl-9 pr-3 text-[13px] text-cream placeholder:text-cream/30 focus:border-gold/50 focus:outline-none"
                />
              </div>
              <div className="flex rounded-full border border-white/12 bg-white/[0.03] p-0.5">
                {(["all", "europe", "usa"] as SideFilter[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSide(option)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium capitalize transition ${
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
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key} className="bg-forest-900">
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((player) => (
              <PlayerTile
                key={player.id}
                player={player}
                selected={state.squad.includes(player.id)}
                blockedReason={blockedFor(player.id)}
                onToggle={() => {
                  togglePlayer(player.id);
                  setSaved(false);
                }}
              />
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="mt-10 text-center text-[13px] text-cream/40">
              Nobody matches that search. Try “Lowry”, “USA” or clear the filters.
            </p>
          ) : null}
        </div>

        {/* card */}
        <aside id="card" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-white/12 bg-forest-900/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow text-cream/40">{mode.name}</p>
                <p className="mt-1 font-display text-lg text-cream">
                  {state.squad.length}/{mode.squadSize} picked
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-cream/50">
                <span className="flex items-center gap-1">
                  <TeamDot side="europe" size={6} /> {europeCount}
                </span>
                <span className="flex items-center gap-1">
                  <TeamDot side="usa" size={6} /> {usaCount}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <BudgetBar spend={spend} budget={mode.budget} />
            </div>

            <div className="mt-4">
              <SquadBoard
                squad={state.squad}
                captain={state.captain}
                onCaptain={setCaptain}
                onRemove={togglePlayer}
                size={mode.squadSize}
              />
            </div>

            <div className="mt-4 space-y-1.5">
              {errors.length === 0 ? (
                <p className="flex items-center gap-2 rounded-lg bg-shamrock/10 px-3 py-2 text-[11.5px] text-shamrock">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path
                      d="M2 6.4 4.7 9 10 3.4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                  Legal card. {state.captain ? "Captain set." : "Now pick a captain."}
                </p>
              ) : (
                errors.map((error) => (
                  <p key={error} className="rounded-lg bg-usa/10 px-3 py-2 text-[11.5px] text-usa">
                    {error}
                  </p>
                ))
              )}
            </div>

            <div className="mt-4 grid gap-2">
              {paid ? (
                <button
                  type="button"
                  disabled={!complete}
                  onClick={onSave}
                  className={`rounded-full py-2.5 text-[13px] font-semibold transition ${
                    complete
                      ? "bg-gold text-forest-950 hover:bg-gold-soft"
                      : "cursor-not-allowed bg-white/10 text-cream/30"
                  }`}
                >
                  {saved ? "Card saved ✓" : "Save my card"}
                </button>
              ) : null}
              {paid && saveError ? (
                <p role="alert" className="rounded-lg bg-usa/10 px-3 py-2 text-[11.5px] text-usa">
                  {saveError}
                </p>
              ) : null}
              {paid ? null : (
                <Link
                  href="/enter"
                  className="rounded-full bg-gold py-2.5 text-center text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
                >
                  Enter €10 to save
                </Link>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    autoFill();
                    setSaved(false);
                  }}
                  className="rounded-full border border-white/15 py-2 text-[12px] font-medium text-cream/75 transition hover:border-gold/50 hover:text-gold-soft"
                >
                  Auto-pick
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearSquad();
                    setSaved(false);
                  }}
                  className="rounded-full border border-white/15 py-2 text-[12px] font-medium text-cream/55 transition hover:border-usa/50 hover:text-usa"
                >
                  Clear
                </button>
              </div>
            </div>

            {saved ? (
              <Link
                href="/team"
                className="mt-3 flex items-center justify-between rounded-lg border border-gold/30 bg-gold/[0.08] px-3 py-2 text-[12px] text-gold-soft"
              >
                View your team sheet
                <span aria-hidden>→</span>
              </Link>
            ) : (
              <p className="mt-3 text-[10.5px] leading-relaxed text-cream/30">
                Tap <span className="rounded bg-gold/20 px-1 text-gold-soft">C</span> to make a
                player captain — his match points double.
                {paid ? " Entry paid." : " Drafting is free; the card saves once you enter."}
              </p>
            )}
          </div>

          <div className="mt-4 hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 lg:block">
            <p className="eyebrow text-cream/35">Need a steer?</p>
            <ul className="mt-2 space-y-2 text-[11.5px] leading-relaxed text-cream/45">
              <li>
                <span className="text-cream/75">Balance the sides.</span> Europe have won three of the
                last four on home soil; the USA own the top of the rankings.
              </li>
              <li>
                <span className="text-cream/75">Five-match men.</span> Scheffler, McIlroy and Åberg
                are the likeliest to play every session.
              </li>
              <li>
                <span className="text-cream/75">Home-weather picks.</span> Wind and rain in Limerick
                rewards Lowry, MacIntyre and Fleetwood.
              </li>
              <li>
                <span className="text-cream/75">Dozen mode.</span> Twelve players covers every
                session — but the captaincy matters less of your total.
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {/* mobile summary bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/12 bg-forest-950/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-cream/40">
              {state.squad.length}/{mode.squadSize} picked · {mode.short}
            </p>
            <p className="tnum text-[13px] text-cream/85">
              {credits(remaining)}m left · {projected.toFixed(0)} projected
            </p>
          </div>
          <a
            href="#card"
            className="rounded-full border border-white/20 px-4 py-2 text-[12px] font-medium text-cream/80"
          >
            View card
          </a>
          {paid ? (
            <button
              type="button"
              disabled={!complete}
              onClick={onSave}
              className={`rounded-full px-4 py-2 text-[12px] font-semibold ${
                complete ? "bg-gold text-forest-950" : "bg-white/10 text-cream/30"
              }`}
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          ) : (
            <Link
              href="/enter"
              className="rounded-full bg-gold px-4 py-2 text-[12px] font-semibold text-forest-950"
            >
              Enter
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
