"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LeagueTable } from "@/components/LeagueTable";
import { Eyebrow } from "@/components/ui";
import { LEAGUES, type League, type LeagueMember } from "@/lib/data";
import { useFantasy } from "@/lib/store";
import type { LeagueView } from "@/lib/server/leagues";

type ServerLeague = League & { server: true; isOwner: boolean };

/** Server leagues are shared between real accounts; map them onto the UI's League shape. */
function fromServer(view: LeagueView): ServerLeague {
  return {
    id: view.id,
    name: view.name,
    code: view.code,
    visibility: "private",
    blurb: view.isOwner
      ? "You're the commissioner. Share the code — friends join from their own phones."
      : "A private league. Everyone here sees the same table.",
    buyIn: view.buyIn,
    prizePool: view.buyIn ? view.buyIn * view.rows.length : undefined,
    members: view.rows.map((r) => ({ manager: r.manager, team: r.team, points: r.points, isYou: r.isYou })),
    server: true,
    isOwner: view.isOwner,
  };
}

const isServer = (l: League): l is ServerLeague => (l as ServerLeague).server === true;

export default function LeaguesPage() {
  const {
    state,
    leagues,
    projected,
    joinLeague,
    leaveLeague,
  } = useFantasy();

  const [signedIn, setSignedIn] = useState(false);
  const [serverLeagues, setServerLeagues] = useState<ServerLeague[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/leagues", { cache: "no-store" });
      const data = (await res.json()) as { signedIn: boolean; leagues: LeagueView[] };
      setSignedIn(data.signedIn);
      setServerLeagues(data.leagues.map(fromServer));
    } catch {
      /* offline: show the leagues kept on this device */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Open (demo) leagues are still joined on this device; private leagues live on the server.
  const myLeagues: League[] = [
    ...serverLeagues,
    ...leagues.filter((l) => state.joinedLeagues.includes(l.id) && l.visibility === "public"),
  ];
  const [selectedId, setSelectedId] = useState<string | null>(myLeagues[0]?.id ?? null);
  const [createName, setCreateName] = useState("");
  const [buyIn, setBuyIn] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = myLeagues.find((l) => l.id === selectedId) ?? myLeagues[0] ?? null;

  const membersFor = (league: League): LeagueMember[] => {
    if (isServer(league)) return league.members;
    const you: LeagueMember | null =
      state.joinedLeagues.includes(league.id) && state.squad.length > 0
        ? {
            manager: state.manager || "You",
            team: state.teamName || "Your team",
            points: Number(projected.toFixed(1)),
            isYou: true,
          }
        : null;
    const managerKey = (state.manager || "").trim().toLowerCase();
    const base = league.members.filter(
      (m) => !m.isYou && m.manager.trim().toLowerCase() !== managerKey,
    );
    return [...base, ...(you ? [you] : [])].sort((a, b) => b.points - a.points);
  };

  const discover = useMemo(
    () =>
      leagues.filter(
        (l) => l.visibility === "public" && !state.joinedLeagues.includes(l.id),
      ),
    [leagues, state.joinedLeagues],
  );

  const handleCreate = async () => {
    if (!createName.trim()) {
      setMessage({ ok: false, text: "Give your league a name first." });
      return;
    }
    if (!signedIn) {
      setMessage({ ok: false, text: "Join the game first (it's free) so friends can find your league." });
      return;
    }
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: createName, buyIn }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { league?: LeagueView; error?: string };
    if (!res?.ok || !data?.league) {
      setMessage({ ok: false, text: data?.error ?? "Couldn't create the league — try again." });
      return;
    }
    await refresh();
    setSelectedId(data.league.id);
    setCreateName("");
    setMessage({ ok: true, text: `${data.league.name} created. Share the code ${data.league.code}.` });
  };

  const handleJoin = async (code: string) => {
    const cleaned = code.trim().toUpperCase();
    // Open demo leagues (e.g. ADARE7) are joined on this device.
    if (leagues.some((l) => l.visibility === "public" && l.code === cleaned)) {
      const result = joinLeague(cleaned);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        const found = leagues.find((l) => l.code === cleaned);
        if (found) setSelectedId(found.id);
        setJoinCode("");
      }
      return;
    }
    if (!signedIn) {
      setMessage({ ok: false, text: "Join the game first (it's free), then enter the code." });
      return;
    }
    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: cleaned }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { league?: LeagueView; error?: string };
    if (!res?.ok || !data?.league) {
      setMessage({ ok: false, text: data?.error ?? "Couldn't join — check the code." });
      return;
    }
    await refresh();
    setSelectedId(data.league.id);
    setJoinCode("");
    setMessage({ ok: true, text: `Joined ${data.league.name}. Good luck.` });
  };

  const handleLeave = async (league: League) => {
    if (isServer(league)) {
      await fetch(`/api/leagues/${encodeURIComponent(league.id)}`, { method: "DELETE" }).catch(() => null);
      await refresh();
    } else {
      leaveLeague(league.id);
    }
    setSelectedId(null);
    setMessage({ ok: true, text: `Left ${league.name}.` });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="max-w-2xl">
        <Eyebrow>Mini-leagues</Eyebrow>
        <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Beat your own friends</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-cream/70">
          The global table is fun. The private league is personal. Create one for the group chat,
          set a buy-in or attach a sponsor, share the six-character code, and settle it on Sunday
          evening at Adare.
        </p>
      </div>

      {/* CREATE / JOIN */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-gold/85">Create</p>
          <h2 className="mt-1.5 text-xl text-cream">Start a private league</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-cream/70">
            You become the commissioner. Seven mates is the sweet spot — anything over twenty and
            somebody will forget to enter.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              aria-label="League name"
              placeholder="e.g. The 19th Hole Invitational"
              className="flex-1 rounded-full border border-white/12 bg-forest-950/60 px-4 py-2.5 text-[13px] text-cream placeholder:text-cream/60 focus:border-gold/50 focus:outline-none"
            />
            <select
              value={buyIn}
              onChange={(e) => setBuyIn(Number(e.target.value))}
              aria-label="League buy-in"
              className="rounded-full border border-white/12 bg-forest-950/60 px-3 py-2.5 text-[12px] text-cream/80 focus:border-gold/50 focus:outline-none"
            >
              <option value={0} className="bg-forest-900">No buy-in</option>
              <option value={10} className="bg-forest-900">€10 buy-in</option>
              <option value={20} className="bg-forest-900">€20 buy-in</option>
            </select>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
            >
              Create league
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-gold/85">Join</p>
          <h2 className="mt-1.5 text-xl text-cream">Got a code?</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-cream/70">
            Six characters, no spaces. Try <span className="text-cream/80">ADARE7</span> to see a
            league in action.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              aria-label="League code"
              autoComplete="off"
              placeholder="ADARE7"
              maxLength={8}
              className="flex-1 rounded-full border border-white/12 bg-forest-950/60 px-4 py-2.5 text-[13px] uppercase tracking-[0.18em] text-cream placeholder:tracking-[0.18em] placeholder:text-cream/60 focus:border-gold/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleJoin(joinCode)}
              className="rounded-full border border-cream/25 px-5 py-2.5 text-[13px] font-semibold text-cream transition hover:border-gold/60 hover:text-gold-soft"
            >
              Join league
            </button>
          </div>
        </div>
      </div>

      {!signedIn ? (
        <p className="mt-4 rounded-xl border border-gold/30 bg-gold/[0.07] px-4 py-3 text-[12.5px] text-cream/70">
          Private leagues are shared between accounts.{" "}
          <Link href="/enter" className="text-gold-soft underline">
            Play free
          </Link>{" "}
          to create or join one, or{" "}
          <Link href="/account" className="text-gold-soft underline">
            sign in
          </Link>{" "}
          if you entered on another device.
        </p>
      ) : null}

      {message ? (
        <p
          className={`mt-4 rounded-xl border px-4 py-3 text-[12.5px] ${
            message.ok
              ? "border-shamrock/30 bg-shamrock/10 text-shamrock"
              : "border-usa/30 bg-usa/10 text-usa"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {/* MY LEAGUES */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[340px_1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl text-cream">Your leagues</h2>
            <span className="rounded-full border border-white/12 px-2.5 py-0.5 text-[11px] text-cream/70 tnum">
              {myLeagues.length}
            </span>
          </div>
          <ul className="space-y-2">
            {myLeagues.map((league) => {
              const members = membersFor(league);
              const youAt = members.findIndex((m) => m.isYou);
              const rank = youAt >= 0 ? youAt + 1 : 1 + members.filter((m) => m.points > projected).length;
              const active = selected?.id === league.id;
              return (
                <li key={league.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(league.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-gold/45 bg-gold/[0.07]"
                        : "border-white/10 bg-white/[0.025] hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium text-cream">
                        {league.name}
                      </span>
                      <span className="tnum shrink-0 text-[11px] text-cream/70">#{rank}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-cream/60">
                      <span>
                        {members.length} teams · {league.visibility}
                        {league.buyIn ? ` · €${league.buyIn} buy-in` : ""}
                      </span>
                      <span className="tracking-[0.14em] text-gold-soft/70">{league.code}</span>
                    </div>
                  </button>
                </li>
              );
            })}
            {myLeagues.length === 0 ? (
              <li className="rounded-xl border border-dashed border-white/12 p-5 text-center text-[12.5px] text-cream/60">
                You are not in a league yet. Join ADARE7 to the right.
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          {selected ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-cream/60">
                    {selected.visibility === "public" ? "Open league" : "Private league"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl text-cream">{selected.name}</h2>
                  <p className="mt-1 max-w-md text-[12.5px] text-cream/70">{selected.blurb}</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-cream/60">
                    {selected.buyIn ? <span>€{selected.buyIn} buy-in</span> : <span>Free to enter</span>}
                    {selected.prizePool ? <span>· €{selected.prizePool} league pot</span> : null}
                    {selected.sponsor ? <span>· Sponsored by {selected.sponsor}</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-gold/30 bg-gold/[0.08] px-3 py-2 text-[12px] tracking-[0.16em] text-gold-soft">
                    {selected.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMessage({ ok: true, text: `Code ${selected.code} copied to clipboard.` });
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        void navigator.clipboard.writeText(selected.code).catch(() => {});
                      }
                    }}
                    className="rounded-lg border border-white/15 px-3 py-2 text-[12px] text-cream/65 transition hover:border-gold/50 hover:text-gold-soft"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="mt-5">
                <LeagueTable members={membersFor(selected)} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-cream/60">
                  Table sorted by projected points. Scoring goes live at the first tee on Friday 17
                  September 2027.
                </p>
                <button
                  type="button"
                  onClick={() => void handleLeave(selected)}
                  className="text-[11.5px] text-cream/60 transition hover:text-usa"
                >
                  Leave league
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* DISCOVER */}
      <div className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <Eyebrow>Discover</Eyebrow>
            <h2 className="mt-1.5 text-2xl text-cream">Open leagues you can join</h2>
          </div>
          <span className="text-[11px] text-cream/60">No invitation needed</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(discover.length ? discover : LEAGUES.filter((l) => l.visibility === "public")).map((league) => (
            <div
              key={league.id}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-medium text-cream">{league.name}</h3>
                <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cream/70">
                  {league.visibility}
                </span>
              </div>
              <p className="mt-2 flex-1 text-[12px] leading-relaxed text-cream/70">{league.blurb}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-cream/60 tnum">
                  {league.members.length} teams · {league.code}
                  {league.buyIn ? ` · €${league.buyIn}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => handleJoin(league.code)}
                  className="rounded-full border border-cream/20 px-3.5 py-1.5 text-[12px] font-medium text-cream/80 transition hover:border-gold/60 hover:text-gold-soft"
                >
                  Join
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
