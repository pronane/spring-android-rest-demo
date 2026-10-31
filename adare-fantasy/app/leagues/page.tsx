"use client";

import { useMemo, useState } from "react";
import { LeagueTable } from "@/components/LeagueTable";
import { Eyebrow } from "@/components/ui";
import { LEAGUES, type League, type LeagueMember } from "@/lib/data";
import { useFantasy } from "@/lib/store";

export default function LeaguesPage() {
  const {
    state,
    leagues,
    projected,
    joinLeague,
    createLeague,
    leaveLeague,
  } = useFantasy();

  const myLeagues = leagues.filter((l) => state.joinedLeagues.includes(l.id));
  const [selectedId, setSelectedId] = useState<string | null>(myLeagues[0]?.id ?? null);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = myLeagues.find((l) => l.id === selectedId) ?? myLeagues[0] ?? null;

  const membersFor = (league: League): LeagueMember[] => {
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

  const handleCreate = () => {
    if (!createName.trim()) {
      setMessage({ ok: false, text: "Give your league a name first." });
      return;
    }
    const league = createLeague(createName);
    setSelectedId(league.id);
    setCreateName("");
    setMessage({ ok: true, text: `${league.name} created. Share the code ${league.code}.` });
  };

  const handleJoin = (code: string) => {
    const result = joinLeague(code);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      const found = leagues.find((l) => l.code === code.trim().toUpperCase());
      if (found) setSelectedId(found.id);
      setJoinCode("");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="max-w-2xl">
        <Eyebrow>Mini-leagues</Eyebrow>
        <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Beat your own friends</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-cream/55">
          The global table is fun. The private league is personal. Create one for the group chat,
          share the six-character code, and settle it on Sunday evening at Adare.
        </p>
      </div>

      {/* CREATE / JOIN */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-gold/85">Create</p>
          <h2 className="mt-1.5 text-xl text-cream">Start a private league</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-cream/45">
            You become the commissioner. Seven mates is the sweet spot — anything over twenty and
            somebody will forget to enter.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. The 19th Hole Invitational"
              className="flex-1 rounded-full border border-white/12 bg-forest-950/60 px-4 py-2.5 text-[13px] text-cream placeholder:text-cream/30 focus:border-gold/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
            >
              Create league
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-gold/85">Join</p>
          <h2 className="mt-1.5 text-xl text-cream">Got a code?</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-cream/45">
            Six characters, no spaces. Try <span className="text-cream/80">ADARE7</span> to see a
            league in action.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ADARE7"
              maxLength={8}
              className="flex-1 rounded-full border border-white/12 bg-forest-950/60 px-4 py-2.5 text-[13px] uppercase tracking-[0.18em] text-cream placeholder:tracking-[0.18em] placeholder:text-cream/30 focus:border-gold/50 focus:outline-none"
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
            <span className="rounded-full border border-white/12 px-2.5 py-0.5 text-[11px] text-cream/45 tnum">
              {myLeagues.length}
            </span>
          </div>
          <ul className="space-y-2">
            {myLeagues.map((league) => {
              const members = membersFor(league);
              const rank = 1 + members.filter((m) => !m.isYou && m.points > projected).length;
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
                      <span className="tnum shrink-0 text-[11px] text-cream/45">#{rank}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-cream/40">
                      <span>
                        {members.length} teams · {league.visibility}
                      </span>
                      <span className="tracking-[0.14em] text-gold-soft/70">{league.code}</span>
                    </div>
                  </button>
                </li>
              );
            })}
            {myLeagues.length === 0 ? (
              <li className="rounded-xl border border-dashed border-white/12 p-5 text-center text-[12.5px] text-cream/40">
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
                  <p className="eyebrow text-cream/40">
                    {selected.visibility === "public" ? "Open league" : "Private league"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl text-cream">{selected.name}</h2>
                  <p className="mt-1 max-w-md text-[12.5px] text-cream/45">{selected.blurb}</p>
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
                <p className="text-[11px] text-cream/35">
                  Table sorted by projected points. Scoring goes live at the first tee on Friday 17
                  September 2027.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    leaveLeague(selected.id);
                    setSelectedId(null);
                    setMessage({ ok: true, text: `Left ${selected.name}.` });
                  }}
                  className="text-[11.5px] text-cream/40 transition hover:text-usa"
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
          <span className="text-[11px] text-cream/35">No invitation needed</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(discover.length ? discover : LEAGUES.filter((l) => l.visibility === "public")).map((league) => (
            <div
              key={league.id}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-medium text-cream">{league.name}</h3>
                <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cream/45">
                  {league.visibility}
                </span>
              </div>
              <p className="mt-2 flex-1 text-[12px] leading-relaxed text-cream/45">{league.blurb}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-cream/40 tnum">
                  {league.members.length} teams · {league.code}
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
