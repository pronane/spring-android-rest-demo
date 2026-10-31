"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { PREDICT_POINTS, type LeaderboardRow, type Results } from "@/lib/scoring";

type Standings = {
  rows: LeaderboardRow[];
  you: LeaderboardRow | null;
  results: {
    source: Results["source"];
    updatedAt: string;
    finals: number;
    total: number;
    cup: { europe: number; usa: number };
  };
  scope: { kind: "global" | "league"; id?: string; name?: string };
  total: number;
};

type LeagueOption = { id: string; name: string; code: string };

const SOURCE_LABEL: Record<Results["source"], string> = {
  simulation: "Simulated final",
  mixed: "Simulated + corrections",
  admin: "Operator results",
};

export default function LeaderboardPage() {
  const [scope, setScope] = useState<string>("global");
  const [standings, setStandings] = useState<Standings | null>(null);
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextScope: string) => {
    setLoading(true);
    try {
      const query = nextScope === "global" ? "" : `?league=${encodeURIComponent(nextScope)}`;
      const res = await fetch(`/api/leaderboard${query}`, { cache: "no-store" });
      const data = (await res.json()) as Standings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load the table.");
      setStandings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the table.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/leagues", { cache: "no-store" }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { leagues?: { league: LeagueOption }[] };
      if (!cancelled && data?.leagues) {
        setLeagues(data.leagues.map((row) => row.league));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void load(scope);
    const timer = setInterval(() => void load(scope), 30_000);
    return () => clearInterval(timer);
  }, [scope, load]);

  const meta = standings?.results;
  const rows = standings?.rows ?? [];
  const you = standings?.you;
  const youVisible = useMemo(() => Boolean(you && rows.some((row) => row.entryId === you.entryId)), [rows, you]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
      <Eyebrow>Standings</Eyebrow>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl text-cream sm:text-5xl">
            {standings?.scope.kind === "league" ? standings.scope.name ?? "League table" : "The table"}
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-cream/70">
            Card points plus predictor points, scored on the server from the same results the live
            page shows. {meta ? `${meta.finals}/${meta.total} matches in.` : ""}
          </p>
        </div>
        {meta ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
            <p className="eyebrow text-cream/60">
              {SOURCE_LABEL[meta.source]}
              {meta.finals === meta.total ? "" : ` · ${meta.total - meta.finals} to play`}
            </p>
            <p className="mt-1 font-display text-2xl text-cream tnum">
              {meta.cup.europe} <span className="text-cream/40">–</span> {meta.cup.usa}
            </p>
            <p className="text-[10.5px] text-cream/60">
              {meta.source === "simulation" ? "Demo feed · re-scores live" : `Updated ${new Date(meta.updatedAt).toLocaleString("en-IE")}`}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Tab active={scope === "global"} onClick={() => setScope("global")}>
          Global
        </Tab>
        {leagues.map((league) => (
          <Tab key={league.id} active={scope === league.id} onClick={() => setScope(league.id)}>
            {league.name}
          </Tab>
        ))}
        {leagues.length === 0 ? (
          <Link href="/leagues" className="text-[12px] text-cream/60 underline-offset-4 hover:text-cream hover:underline">
            Create a league to add its table
          </Link>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-usa/30 bg-usa/10 px-4 py-2.5 text-[12.5px] text-usa">
          {error}
        </p>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            {standings?.scope.kind === "league" ? "Private league standings" : "Global standings"}
          </caption>
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.16em] text-cream/60">
              <th scope="col" className="px-4 py-3 font-semibold">#</th>
              <th scope="col" className="px-4 py-3 font-semibold">Team</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">Manager</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Card</th>
              <th scope="col" className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Picks</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entryId} className={`border-b border-white/[0.06] text-[13px] ${row.isYou ? "bg-gold/[0.07]" : ""}`}>
                <td className="px-4 py-3 text-cream/60 tnum">{row.rank}</td>
                <td className="px-4 py-3 text-cream">
                  <span className="inline-flex items-center gap-2">
                    {row.team}
                    {row.isYou ? (
                      <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-soft">
                        You
                      </span>
                    ) : null}
                    {row.prizeEligible ? null : (
                      <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-cream/60">
                        No prizes
                      </span>
                    )}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-cream/70 sm:table-cell">{row.manager}</td>
                <td className="px-4 py-3 text-right text-cream/80 tnum">{row.card.toFixed(1)}</td>
                <td className="hidden px-4 py-3 text-right text-cream/80 tnum sm:table-cell">{row.predictions.toFixed(1)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gold-soft tnum">{row.total.toFixed(1)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-cream/70">
                  No cards in this table yet.{" "}
                  <Link href="/enter" className="text-gold-soft underline-offset-4 hover:underline">
                    Enter the cup
                  </Link>{" "}
                  or{" "}
                  <Link href="/draft" className="text-gold-soft underline-offset-4 hover:underline">
                    draft a card
                  </Link>
                  .
                </td>
              </tr>
            ) : null}
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-cream/60">
                  Scoring…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {you && !youVisible ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-[12.5px] text-cream/85">
          <span>
            You are {you.rank}
            {you.rank === 1 ? "st" : you.rank === 2 ? "nd" : you.rank === 3 ? "rd" : "th"} of {standings?.total} with{" "}
            <span className="tnum text-gold-soft">{you.total.toFixed(1)}</span> points.
          </span>
          <span className="text-cream/60">
            Card {you.card.toFixed(1)} · picks {you.predictions.toFixed(1)}
          </span>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-[12.5px] leading-relaxed text-cream/70">
          <p className="eyebrow text-cream/60">How the total is built</p>
          <p className="mt-2">
            Card: 5 per foursomes/fourball win, 6 per singles win, half points for a halved match, +1
            appearance, +1 birdie, +4 eagle, +8 albatross, +5 unbeaten, and the captain&apos;s match
            points doubled.
          </p>
          <p className="mt-2">
            Predictor: {PREDICT_POINTS.match} per match called, {PREDICT_POINTS.award} per award,{" "}
            {PREDICT_POINTS.exact} for the exact scoreline.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-[12.5px] leading-relaxed text-cream/70">
          <p className="eyebrow text-cream/60">Where results come from</p>
          <p className="mt-2">
            Until a live provider is connected the cup is simulated from a fixed seed, so the table is
            reproducible. Operators can correct a match, an event or an award through the admin API,
            and the table re-scores immediately.
          </p>
          <Link href="/rules" className="mt-3 inline-block text-gold-soft underline-offset-4 hover:underline">
            Full rules →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition ${
        active
          ? "border-gold/50 bg-gold/15 text-gold-soft"
          : "border-white/12 text-cream/70 hover:border-gold/40 hover:text-cream"
      }`}
    >
      {children}
    </button>
  );
}
