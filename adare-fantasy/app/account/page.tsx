"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { useFantasy, type TeamState } from "@/lib/store";
import { eur } from "@/lib/helpers";
import type { User } from "@/lib/server/db";
import type { EntryScore, Results } from "@/lib/scoring";
import { PLAYER_BY_ID } from "@/lib/data";
import { ShareButtons } from "@/components/ShareButtons";
import { SocialSignIn } from "@/components/SocialSignIn";

type Breakdown = {
  entry: { ref: string; team: string; manager: string; prizeEligible: boolean };
  score: EntryScore;
  results: {
    source: Results["source"];
    finals: number;
    total: number;
    cup: { europe: number; usa: number };
    awards: { mvp: string | null; topScorer: string | null; rookie: string | null };
    updatedAt: string;
    clock?: string;
    minute?: number;
    phase?: "pre" | "live" | "done";
    inPlay?: number;
    provisional?: boolean;
  };
};

type Invite = { code: string; invited: number; bonusTransfers: number; referredBy: string | null };

export default function AccountPage() {
  const { state, projected, mode, hydrate, ready } = useFantasy();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    // Read ?signin= without useSearchParams (which would need a Suspense boundary).
    const params = new URLSearchParams(window.location.search);
    const signin = params.get("signin");
    const via = params.get("via");
    if (signin === "ok") {
      setNotice(
        via
          ? `Signed in with ${via[0].toUpperCase()}${via.slice(1)} — this device stays signed in.`
          : "You're signed in on this device.",
      );
    }
    if (signin === "expired") setNotice("That sign-in link has expired or was already used. Ask for a new one.");
    if (signin === "error") {
      setNotice(params.get("reason") ?? "That sign-in did not complete. Try again.");
      setNoticeIsError(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data: { signedIn: boolean; user: User | null }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Server-side score for this entry. Salted by the saved card, so it refreshes
  // when the card or the results change.
  useEffect(() => {
    if (!user?.entry?.squad?.length) {
      setBreakdown(null);
      return;
    }
    let cancelled = false;
    fetch("/api/score", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Breakdown | null) => {
        if (!cancelled) setBreakdown(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.entry?.squad, user?.entry?.captain, user?.entry?.predictions, user?.entry?.awards]);

  // The invite code is the entry ref: no separate share identity to manage.
  useEffect(() => {
    if (!user?.entry?.ref) {
      setInvite(null);
      return;
    }
    let cancelled = false;
    fetch("/api/referral", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Invite | null) => {
        if (!cancelled) setInvite(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.entry?.ref]);

  // Signed in on a new device: pull the saved card down from the server so the
  // browser shows the real entry instead of the demo card.
  useEffect(() => {
    if (!ready || !user?.entry) return;
    if (state.entry.ref === user.entry.ref && !state.isDemo) return;
    const e = user.entry;
    hydrate({
      manager: user.manager,
      teamName: user.teamName,
      mode: e.mode ?? "classic",
      squad: e.squad ?? [],
      captain: e.captain ?? null,
      predictions: (e.predictions ?? {}) as TeamState["predictions"],
      awards: e.awards ?? { mvp: null, topScorer: null, rookie: null },
      pinpoint: e.pinpoint ?? {},
      entry: { paid: true, plan: e.plan, ref: e.ref, amount: e.amount, paidAt: e.paidAt },
      isDemo: false,
      updatedAt: e.updatedAt ?? e.paidAt,
    });
  }, [ready, user, state.entry.ref, state.isDemo, hydrate]);

  const requestLink = async () => {
    setLinkMsg(null);
    setDevLink(null);
    const res = await fetch("/api/session/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: linkEmail }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { message?: string; error?: string; devLink?: string };
    setLinkMsg(data?.error ?? data?.message ?? "Couldn't send the link — try again.");
    if (data?.devLink) setDevLink(data.devLink);
  };

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setUser(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-10">
      <Eyebrow>Account</Eyebrow>
      <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Your entry</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-cream/70">
        Your entry is stored on the server, so you can sign in on any device with Google, Apple,
        Facebook or a one-time email link.
      </p>

      {notice ? (
        <p
          role={noticeIsError ? "alert" : "status"}
          className={`mt-6 rounded-lg border px-4 py-2.5 text-[12.5px] ${
            noticeIsError
              ? "border-usa/40 bg-usa/10 text-usa"
              : "border-gold/30 bg-gold/[0.08] text-gold-soft"
          }`}
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-cream/60">Signed in as</p>
          {loading ? (
            <p className="mt-2 text-[13px] text-cream/60">Loading…</p>
          ) : user ? (
            <>
              <p className="mt-2 text-[15px] text-cream">{user.manager}</p>
              <p className="text-[12.5px] text-cream/70">{user.email}</p>
              <p className="mt-3 text-[11px] text-cream/60">
                Account created {new Date(user.createdAt).toLocaleDateString("en-IE")}
              </p>
              {user.identities && user.identities.length > 0 ? (
                <p className="mt-1 text-[11px] text-cream/60">
                  Sign-in:{" "}
                  {user.identities
                    .map((identity) => `${identity.provider[0].toUpperCase()}${identity.provider.slice(1)}`)
                    .join(", ")}
                </p>
              ) : null}
              <div className="mt-3">
                <SocialSignIn
                  next="/account"
                  note="Add another provider to this account — it signs in to the same entry."
                />
              </div>
              <button
                type="button"
                onClick={signOut}
                className="mt-4 rounded-full border border-white/15 px-4 py-1.5 text-[11.5px] text-cream/70 transition hover:border-usa/40 hover:text-usa"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] text-cream/70">
                Entered on another phone or laptop? Sign in with a provider, or we&apos;ll email you a
                one-time link.
              </p>
              <SocialSignIn next="/account" />
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email you entered with"
                  className="min-w-0 flex-1 rounded-full border border-white/15 bg-forest-950/60 px-3 py-1.5 text-[12.5px] text-cream placeholder:text-cream/60"
                />
                <button
                  type="button"
                  onClick={requestLink}
                  className="rounded-full bg-gold px-3 py-1.5 text-[12px] font-semibold text-forest-950"
                >
                  Email me a link
                </button>
              </div>
              {linkMsg ? <p className="mt-2 text-[11.5px] text-cream/70">{linkMsg}</p> : null}
              {devLink ? (
                <a href={devLink} className="mt-1 block break-all text-[11px] text-gold-soft underline">
                  Dev mode (no mail provider): open sign-in link
                </a>
              ) : null}
              <Link
                href="/enter"
                className="mt-4 inline-flex rounded-full border border-white/20 px-4 py-2 text-[12px] text-cream/75"
              >
                New here? Get your entry
              </Link>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-cream/60">Entry receipt</p>
          {user?.entry ? (
            <>
              <p className="mt-2 font-display text-2xl text-gold-soft">{user.entry.ref}</p>
              <dl className="mt-3 space-y-1.5 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-cream/70">Plan</dt>
                  <dd className="text-cream/85">{user.entry.plan}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cream/70">Paid</dt>
                  <dd className="text-cream/85">
                    {user.entry.prizeEligible ?? user.entry.amount > 0
                      ? `${eur(user.entry.amount)} · prize entry`
                      : `${eur(user.entry.amount)} · not prize eligible`}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cream/70">Edition</dt>
                  <dd className="text-cream/85">{user.entry.editionId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cream/70">Card saved</dt>
                  <dd className="text-cream/85">{user.entry.squad?.length ?? 0} players</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] text-cream/70">
                {state.entry.paid
                  ? `Local demo entry ${state.entry.ref} — no server receipt.`
                  : "No entry on this browser yet."}
              </p>
              {!state.entry.paid ? (
                <Link
                  href="/enter"
                  className="mt-4 inline-flex rounded-full border border-white/20 px-4 py-2 text-[12px] text-cream/75"
                >
                  See entry options
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-cream/60">Your card</p>
            <p className="mt-1 text-[15px] text-cream">
              {state.teamName || "Untitled"} · {mode.name}
            </p>
            <p className="text-[12px] text-cream/70">
              {state.squad.length}/{mode.squadSize} players · {projected.toFixed(1)} projected pts ·
              captain {state.captain ? "set" : "not set"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/team"
              className="rounded-full bg-cream px-4 py-2 text-[12px] font-semibold text-forest-900"
            >
              Open my team
            </Link>
            <Link
              href="/predict"
              className="rounded-full border border-white/20 px-4 py-2 text-[12px] text-cream/75"
            >
              My predictions
            </Link>
          </div>
        </div>
      </div>

      {breakdown ? (
        <div className="mt-4 rounded-2xl border border-gold/25 bg-gold/[0.05] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-gold-soft/80">Your points</p>
              <p className="mt-1 font-display text-3xl text-cream tnum">{breakdown.score.total.toFixed(1)}</p>
              <p className="text-[11.5px] text-cream/70">
                Card {breakdown.score.card.total.toFixed(1)} · picks{" "}
                {breakdown.score.predictions.total.toFixed(1)} ·{" "}
                {breakdown.score.transferPenalty
                  ? `transfers −${breakdown.score.transferPenalty} · `
                  : ""}
                {breakdown.results.finals}/{breakdown.results.total} matches in
              </p>
              {breakdown.results.clock ? (
                <p className="mt-1 text-[10.5px] text-cream/50">
                  {breakdown.results.clock}
                  {breakdown.results.provisional ? " · provisional" : ""}
                </p>
              ) : null}
            </div>
            <Link
              href="/leaderboard"
              className="rounded-full border border-gold/40 px-4 py-2 text-[12px] font-semibold text-gold-soft transition hover:bg-gold/10"
            >
              See the table
            </Link>
          </div>

          <ul className="mt-4 grid gap-1.5 text-[12px] sm:grid-cols-2">
            {[...breakdown.score.card.players]
              .sort((a, b) => b.total - a.total)
              .slice(0, 6)
              .map((row) => (
                <li key={row.playerId} className="flex items-center justify-between gap-2 text-cream/80">
                  <span>
                    {PLAYER_BY_ID[row.playerId]?.shortName ?? row.playerId}
                    {row.playerId === breakdown.score.card.captainId ? (
                      <span className="ml-1.5 rounded bg-gold/20 px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-gold-soft">
                        C
                      </span>
                    ) : null}
                  </span>
                  <span className="tnum text-cream/70">
                    {row.matches} {row.matches === 1 ? "match" : "matches"} · {row.total.toFixed(1)}
                  </span>
                </li>
              ))}
          </ul>

          <p className="mt-1 text-[10.5px] leading-relaxed text-cream/60">
            Armband: {(["fri", "sat", "sun"] as const)
              .map((day) => {
                const id = breakdown.score.card.sessionCaptains[day];
                const label = day === "fri" ? "Fri" : day === "sat" ? "Sat" : "Sun";
                return `${label} ${id ? PLAYER_BY_ID[id]?.shortName ?? id : "—"}`;
              })
              .join(" · ")}
            {breakdown.score.card.captainBonus > 0
              ? ` · +${breakdown.score.card.captainBonus.toFixed(1)} from doubling`
              : ""}
          </p>

          <p className="mt-1 text-[10.5px] leading-relaxed text-cream/60">
            Predictor: {breakdown.score.predictions.matchHits} matches called
            {breakdown.score.predictions.awardHits.length
              ? `, ${breakdown.score.predictions.awardHits.length} award${breakdown.score.predictions.awardHits.length === 1 ? "" : "s"}`
              : ""}
            {breakdown.score.predictions.exact ? ", exact scoreline" : ""}. Results are{" "}
            {breakdown.results.source === "simulation"
              ? "simulated"
              : breakdown.results.source === "feed"
                ? "from the live feed"
                : "operator-corrected"}.
          </p>
        </div>
      ) : null}

      {user?.entry ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow text-cream/60">Share your card · invite a friend</p>
              <p className="mt-1 text-[13px] text-cream/80">
                {user.teamName} · <Link href={`/t/${user.entry.ref}`} className="text-gold-soft underline decoration-gold/40">/t/{user.entry.ref}</Link>
              </p>
              <p className="mt-1 max-w-md text-[11.5px] leading-relaxed text-cream/55">
                The link shows your live card and your rank. Anyone who enters with it gets a free
                transfer — and so do you.
              </p>
              <p className="mt-2 text-[11px] text-cream/60">
                Invited: {invite?.invited ?? 0} · free transfers earned: {invite?.bonusTransfers ?? 0}
                {invite?.referredBy ? ` · you joined on ${invite.referredBy}` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ShareButtons
                url={`/t/${user.entry.ref}`}
                text={`${user.teamName} on ${breakdown?.score.total.toFixed(1) ?? "—"} points at Adare 2027. Beat that.`}
                compact
              />
              <Link
                href={`/enter?ref=${encodeURIComponent(user.entry.ref)}`}
                className="text-[11.5px] text-cream/60 underline decoration-white/25"
              >
                Preview the invite
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[10.5px] leading-relaxed text-cream/60">
        Demo payments: no card data is stored or transmitted. Production swaps the JSON store for
        Postgres and the demo checkout for Stripe with server-side webhooks.
      </p>
    </div>
  );
}
