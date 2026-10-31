import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import { ShareButtons } from "@/components/ShareButtons";
import { PLAYER_BY_ID } from "@/lib/data";
import { findUserByEntryRef } from "@/lib/server/db";
import { getBreakdown, getStandings } from "@/lib/server/standings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ref: string }> };

/**
 * A public card, one per entry.
 *
 * Everything here is server-rendered from the store and the same scoring
 * function the table uses, so a shared link cannot show a different number from
 * the leaderboard. The link is the growth loop: the team name is the headline,
 * the CTA is the invite, and the invite code is the entry ref itself.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ref } = await params;
  const user = await findUserByEntryRef(ref);
  if (!user?.entry?.ref) return { title: "Entry not found · Twenty-Eight" };
  const breakdown = await getBreakdown(user.id);
  const points = breakdown?.score.total.toFixed(1) ?? "—";
  const title = `${user.teamName} — ${points} pts · Twenty-Eight`;
  const description = `${user.manager}'s card at Adare 2027: ${breakdown?.score.card.total.toFixed(1) ?? "—"} from the players, ${breakdown?.score.predictions.total.toFixed(1) ?? "—"} from the predictor.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicCardPage({ params }: Params) {
  const { ref } = await params;
  const user = await findUserByEntryRef(ref);
  if (!user?.entry?.ref) notFound();

  const [breakdown, standings] = await Promise.all([
    getBreakdown(user.id),
    getStandings({ limit: 500 }),
  ]);
  if (!breakdown) notFound();

  const row = standings.rows.find((r) => r.entryId === user.id);
  const score = breakdown.score;
  const results = breakdown.results;
  const players = [...score.card.players].sort((a, b) => b.total - a.total);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-10">
      <Eyebrow>Public card · Adare 2027</Eyebrow>

      <article className="mt-4 overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-gold/[0.09] via-forest-950 to-forest-950 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-cream/50">{user.manager}</p>
            <h1 className="mt-1 font-display text-4xl text-cream sm:text-5xl">{user.teamName}</h1>
            <p className="mt-2 text-[12px] text-cream/55">{user.entry.ref}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-5xl text-gold-soft tnum">{score.total.toFixed(1)}</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-cream/50">points</p>
            {row ? (
              <p className="mt-2 rounded-full border border-white/15 px-3 py-1 text-[11px] text-cream/70">
                Rank {row.rank} of {standings.total}
              </p>
            ) : null}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Players", value: score.card.total.toFixed(1) },
            { label: "Predictor", value: score.predictions.total.toFixed(1) },
            { label: "Transfers", value: score.transferPenalty ? `−${score.transferPenalty}` : "—" },
            { label: "Matches in", value: `${results.finals}/${results.total}` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-cream/55">{stat.label}</dt>
              <dd className="mt-1 font-display text-xl text-cream tnum">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <p className="text-[10.5px] uppercase tracking-[0.16em] text-cream/55">The card</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {players.map((player) => {
              const info = PLAYER_BY_ID[player.playerId];
              const armband =
                score.card.sessionCaptains.fri === player.playerId ||
                score.card.sessionCaptains.sat === player.playerId ||
                score.card.sessionCaptains.sun === player.playerId ||
                score.card.captainId === player.playerId;
              return (
                <li
                  key={player.playerId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[12.5px]"
                >
                  <span className="text-cream/85">
                    {info?.shortName ?? player.playerId}
                    {armband ? (
                      <span className="ml-1.5 rounded bg-gold/20 px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-gold-soft">
                        C
                      </span>
                    ) : null}
                  </span>
                  <span className="text-cream/55 tnum">{player.total.toFixed(1)}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-5 text-[11px] text-cream/55">
          {results.clock} · {results.source === "feed" ? "live feed" : results.source === "simulation" ? "simulation" : "operator results"}
          {results.provisional ? " · provisional, updates as matches finish" : ""}
        </p>
      </article>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <ShareButtons url={`/t/${user.entry.ref}`} text={`${user.teamName} on ${score.total.toFixed(1)} points at Adare 2027. Beat that.`} />
        <Link
          href={`/enter?ref=${encodeURIComponent(user.entry.ref)}`}
          className="rounded-full bg-gold px-4 py-2 text-[12.5px] font-semibold text-forest-950 transition hover:bg-gold-soft"
        >
          Enter with this card&apos;s invite
        </Link>
      </div>

      <p className="mt-8 text-[11.5px] leading-relaxed text-cream/60">
        Every number on this page is scored by the server from the results snapshot — the same
        scoring function as the leaderboard. An invite adds a free transfer to both cards.
      </p>
    </div>
  );
}
