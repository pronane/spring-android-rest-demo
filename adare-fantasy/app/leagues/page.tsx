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
      setMessage({ ok: false, text: "Enter the game first so friends can find your league." });
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
      setMessage({ ok: false, text: "Enter the game first, then use the code." });
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
        <h1 className="mt-2 text-4xl text-ink sm:text-5xl">Beat your own friends</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          The global table is fun. The private league is personal. Create one for the group chat,
          set a buy-in or attach a sponsor, share the six-character code, and settle it on Sunday
          evening at Adare.
        </p>
      </div>

      {/* CREATE / JOIN */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="eyebrow text-accent/85">Create</p>
          <h2 className="mt-1.5 text-xl text-ink">Start a private league</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            You become the commissioner. Seven mates is the sweet spot — anything over twenty and
            somebody will forget to enter.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              aria-label="League name"
              placeholder="e.g. The 19th Hole Invitational"
              className="flex-1 rounded-full border border-ink/12 bg-paper/60 px-4 py-2.5 text-[13px] text-ink placeholder:text-ink-soft focus:border-accent/50 focus:outline-none"
            />
            <select
              value={buyIn}
              onChange={(e) => setBuyIn(Number(e.target.value))}
              aria-label="League buy-in"
              className="rounded-full border border-ink/12 bg-paper/60 px-3 py-2.5 text-[12px] text-ink/80 focus:border-accent/50 focus:outline-none"
            >
              <option value={0} className="bg-surface">No buy-in</option>
              <option value={10} className="bg-surface">€10 buy-in</option>
              <option value={20} className="bg-surface">€20 buy-in</option>
            </select>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="rounded-full bg-butter px-5 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-butter-deep"
            >
              Create league
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="eyebrow text-accent/85">Join</p>
          <h2 className="mt-1.5 text-xl text-ink">Got a code?</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            Six characters, no spaces. Try <span className="text-ink/80">ADARE7</span> to see a
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
              className="flex-1 rounded-full border border-ink/12 bg-paper/60 px-4 py-2.5 text-[13px] uppercase tracking-[0.18em] text-ink placeholder:tracking-[0.18em] placeholder:text-ink-soft focus:border-accent/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleJoin(joinCode)}
              className="rounded-full border border-line/25 px-5 py-2.5 text-[13px] font-semibold text-ink transition hover:border-accent/60 hover:text-accent"
            >
              Join league
            </button>
          </div>
        </div>
      </div>

      {!signedIn ? (
        <p className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.07] px-4 py-3 text-[12.5px] text-ink-soft">
          Private leagues are shared between accounts.{" "}
          <Link href="/enter" className="text-accent underline">
            Get your entry
          </Link>{" "}
          to create or join one, or{" "}
          <Link href="/account" className="text-accent underline">
            sign in
          </Link>{" "}
          if you entered on another device.
        </p>
      ) : null}

      {message ? (
        <p
          className={`mt-4 rounded-xl border px-4 py-3 text-[12.5px] ${
            message.ok
              ? "border-sage/30 bg-sage/10 text-sage"
              : "border-clay/30 bg-clay/10 text-clay"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {/* MY LEAGUES */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[340px_1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl text-ink">Your leagues</h2>
            <span className="rounded-full border border-ink/12 px-2.5 py-0.5 text-[11px] text-ink-soft tnum">
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
                        ? "border-accent/45 bg-accent/[0.07]"
                        : "border-line bg-surface hover:border-ink/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium text-ink">
                        {league.name}
                      </span>
                      <span className="tnum shrink-0 text-[11px] text-ink-soft">#{rank}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-ink-soft">
                      <span>
                        {members.length} teams · {league.visibility}
                        {league.buyIn ? ` · €${league.buyIn} buy-in` : ""}
                      </span>
                      <span className="tracking-[0.14em] text-accent/70">{league.code}</span>
                    </div>
                  </button>
                </li>
              );
            })}
            {myLeagues.length === 0 ? (
              <li className="rounded-xl border border-dashed border-ink/12 p-5 text-center text-[12.5px] text-ink-soft">
                You are not in a league yet. Join ADARE7 to the right.
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          {selected ? (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-ink-soft">
                    {selected.visibility === "public" ? "Open league" : "Private league"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl text-ink">{selected.name}</h2>
                  <p className="mt-1 max-w-md text-[12.5px] text-ink-soft">{selected.blurb}</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-soft">
                    {selected.buyIn ? <span>€{selected.buyIn} buy-in</span> : <span>Free to enter</span>}
                    {selected.prizePool ? <span>· €{selected.prizePool} league pot</span> : null}
                    {selected.sponsor ? <span>· Sponsored by {selected.sponsor}</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-accent/30 bg-accent/[0.08] px-3 py-2 text-[12px] tracking-[0.16em] text-accent">
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
                    className="rounded-lg border border-ink/15 px-3 py-2 text-[12px] text-ink-soft transition hover:border-accent/50 hover:text-accent"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="mt-5">
                <LeagueTable members={membersFor(selected)} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-ink-soft">
                  Table sorted by projected points. Scoring goes live at the first tee on Friday 17
                  September 2027.
                </p>
                <button
                  type="button"
                  onClick={() => void handleLeave(selected)}
                  className="text-[11.5px] text-ink-soft transition hover:text-clay"
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
            <h2 className="mt-1.5 text-2xl text-ink">Open leagues you can join</h2>
          </div>
          <span className="text-[11px] text-ink-soft">No invitation needed</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(discover.length ? discover : LEAGUES.filter((l) => l.visibility === "public")).map((league) => (
            <div
              key={league.id}
              className="flex flex-col rounded-2xl border border-line bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-medium text-ink">{league.name}</h3>
                <span className="rounded-full border border-ink/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  {league.visibility}
                </span>
              </div>
              <p className="mt-2 flex-1 text-[12px] leading-relaxed text-ink-soft">{league.blurb}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-ink-soft tnum">
                  {league.members.length} teams · {league.code}
                  {league.buyIn ? ` · €${league.buyIn}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => handleJoin(league.code)}
                  className="rounded-full border border-line/20 px-3.5 py-1.5 text-[12px] font-medium text-ink/80 transition hover:border-accent/60 hover:text-accent"
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
