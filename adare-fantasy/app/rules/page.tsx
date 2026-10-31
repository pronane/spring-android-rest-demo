import Link from "next/link";
import { Eyebrow, SectionHead } from "@/components/ui";
import { BUDGET, MAX_PER_SIDE, SCHEDULE, SCORING, SQUAD_SIZE, TOURNAMENT } from "@/lib/data";

const MATCH_ROWS = [
  {
    type: "Foursomes",
    detail: "Alternate shot · 4 matches per session, Fri & Sat",
    win: `+${SCORING.foursomes.win}`,
    half: `+${SCORING.foursomes.half}`,
    loss: "0",
  },
  {
    type: "Fourball",
    detail: "Best ball · 4 matches per session, Fri & Sat",
    win: `+${SCORING.fourball.win}`,
    half: `+${SCORING.fourball.half}`,
    loss: "0",
  },
  {
    type: "Singles",
    detail: "Twelve matches on Sunday",
    win: `+${SCORING.singles.win}`,
    half: `+${SCORING.singles.half}`,
    loss: "0",
  },
];

const BONUS_ROWS = [
  { label: "Appearance", value: `+${SCORING.appearance}`, note: "per match your player starts" },
  { label: "Birdie", value: `+${SCORING.birdie}`, note: "per birdie made in any session" },
  { label: "Eagle", value: `+${SCORING.eagle}`, note: "eagle or better on a hole" },
  { label: "Albatross", value: `+${SCORING.albatross}`, note: "the rarest score in golf" },
  { label: "Hole in one", value: `+${SCORING.holeInOne}`, note: "one per tournament, we suspect" },
  { label: "Unbeaten week", value: `+${SCORING.unbeatenBonus}`, note: "3+ matches, no losses" },
  { label: "Captain", value: `×${SCORING.captainMultiplier}`, note: "match points only, not bonuses" },
];

const FAQ = [
  {
    q: "When does my squad lock?",
    a: `At the first tee on Friday 17 September 2027 — 07:35 Irish time. You get ${SCORING.freeTransfers} free transfers before then; every one after that costs ${SCORING.transferPenalty} points.`,
  },
  {
    q: "What happens when the real teams are named?",
    a: "The field shown now is a projection. Automatic qualifiers are confirmed on 22 August 2027, with captain's picks the following week. Players who miss out are removed and your budget is refunded automatically — you get a free transfer for each one.",
  },
  {
    q: "Can I pick six Americans?",
    a: `No. You need at least one player from each side and no more than ${MAX_PER_SIDE} from either. It keeps the game honest: you cannot win by simply backing the winning team.`,
  },
  {
    q: "How is the captain chosen?",
    a: "One of your six wears the armband. His match points are doubled — so a Sunday singles win is worth 12. You can move the armband freely before the lock and once between sessions.",
  },
  {
    q: "What if a match is halved?",
    a: `Halves still score: ${SCORING.foursomes.half} points in foursomes and fourball, ${SCORING.singles.half} in singles, plus the appearance point.`,
  },
  {
    q: "Is it free?",
    a: "Yes. No entry fee, no card details, no premium armband. Private leagues can sort out their own forfeits.",
  },
];

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-10">
      <Eyebrow>Scoring &amp; rules · draft v0.1</Eyebrow>
      <h1 className="mt-2 max-w-3xl text-balance text-4xl text-cream sm:text-5xl">
        Simple enough to explain in the pub. Deep enough to argue about until Sunday.
      </h1>
      <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-cream/55">
        Your six players earn points from every match they play at Adare Manor — wins, halves,
        birdies, eagles and a handful of bonuses. One of them wears the armband and doubles his
        match points.
      </p>

      {/* SCORING TABLE */}
      <section className="mt-12">
        <SectionHead eyebrow="Match points" title="What a result is worth" />
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-white/[0.04] text-[9.5px] uppercase tracking-[0.16em] text-cream/40">
                <th className="py-3 pl-5 font-semibold">Session</th>
                <th className="hidden py-3 font-semibold sm:table-cell">Format</th>
                <th className="py-3 text-right font-semibold">Win</th>
                <th className="py-3 text-right font-semibold">Half</th>
                <th className="py-3 pr-5 text-right font-semibold">Loss</th>
              </tr>
            </thead>
            <tbody>
              {MATCH_ROWS.map((row) => (
                <tr key={row.type} className="border-t border-white/[0.07]">
                  <td className="py-3.5 pl-5 font-medium text-cream">{row.type}</td>
                  <td className="hidden py-3.5 text-[12px] text-cream/40 sm:table-cell">
                    {row.detail}
                  </td>
                  <td className="py-3.5 text-right tnum text-shamrock">{row.win}</td>
                  <td className="py-3.5 text-right tnum text-cream/70">{row.half}</td>
                  <td className="py-3.5 pr-5 text-right tnum text-cream/35">{row.loss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BONUS_ROWS.slice(0, 4).map((row) => (
            <div key={row.label} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[12.5px] text-cream/80">{row.label}</p>
                <p className="font-display text-lg text-gold-soft tnum">{row.value}</p>
              </div>
              <p className="mt-1 text-[10.5px] text-cream/35">{row.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {BONUS_ROWS.slice(4).map((row) => (
            <div key={row.label} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[12.5px] text-cream/80">{row.label}</p>
                <p className="font-display text-lg text-gold-soft tnum">{row.value}</p>
              </div>
              <p className="mt-1 text-[10.5px] text-cream/35">{row.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WORKED EXAMPLE */}
      <section className="mt-12">
        <SectionHead eyebrow="Worked example" title="McIlroy with the armband" />
        <div className="grid gap-4 rounded-2xl border border-gold/20 bg-gold/[0.045] p-5 sm:grid-cols-[1.1fr_0.9fr] sm:p-6">
          <div>
            <p className="text-[13px] leading-relaxed text-cream/65">
              Say Rory plays all five sessions and goes 4–0–1 with six birdies and an eagle on the
              16th. Your card earns:
            </p>
            <ul className="mt-4 space-y-1.5 text-[12.5px]">
              <li className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-cream/55">Match points · 4 wins, 1 half</span>
                <span className="tnum text-cream/85">22.5</span>
              </li>
              <li className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-cream/55">Captain ×2 (match points only)</span>
                <span className="tnum text-cream/85">45.0</span>
              </li>
              <li className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-cream/55">5 appearances</span>
                <span className="tnum text-cream/85">+5.0</span>
              </li>
              <li className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-cream/55">6 birdies · 1 eagle</span>
                <span className="tnum text-cream/85">+10.0</span>
              </li>
              <li className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="text-cream/55">Unbeaten week</span>
                <span className="tnum text-cream/85">+5.0</span>
              </li>
            </ul>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-gold/25 bg-forest-950/50 p-5 text-center">
            <p className="eyebrow text-cream/40">Total</p>
            <p className="mt-1 font-display text-5xl text-gold-soft tnum">65.0</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-cream/40">
              A very good week — roughly a quarter of a winning total in a small league.
            </p>
          </div>
        </div>
      </section>

      {/* FORMAT */}
      <section id="format" className="mt-14 scroll-mt-24">
        <SectionHead
          eyebrow="The format"
          title="28 matches, 28 points"
          sub={`${TOURNAMENT.edition} · ${TOURNAMENT.venue}, ${TOURNAMENT.village}. Europe hold the cup and need ${TOURNAMENT.retainAt} points to keep it. The USA need 14.5 to win it back.`}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {SCHEDULE.map((day) => (
            <div key={day.day} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <p className="eyebrow text-cream/40">{day.label}</p>
              <h3 className="mt-1 text-lg text-cream">{day.day}</h3>
              <ul className="mt-3 space-y-2 text-[12.5px]">
                {day.sessions.map((session) => (
                  <li key={session.name} className="flex items-center justify-between">
                    <span className="text-cream/65">{session.name}</span>
                    <span className="tnum text-cream/40">{session.points} pts</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* SQUAD RULES */}
      <section className="mt-14">
        <SectionHead eyebrow="Squad rules" title="What you can and cannot do" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { k: "Squad size", v: `${SQUAD_SIZE} players` },
            { k: "Budget", v: `${BUDGET}m credits` },
            { k: "Max per side", v: `${MAX_PER_SIDE} players` },
            { k: "Min per side", v: "1 player" },
            { k: "Free transfers", v: `${SCORING.freeTransfers} before the lock` },
            { k: "Armband", v: "1, movable before the lock" },
          ].map((item) => (
            <div
              key={item.k}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3"
            >
              <span className="text-[12.5px] text-cream/55">{item.k}</span>
              <span className="text-[13px] font-medium text-cream">{item.v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mt-14 scroll-mt-24">
        <SectionHead eyebrow="FAQ" title="The obvious questions" />
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4 open:bg-white/[0.02]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium text-cream">
                {item.q}
                <span className="text-gold-soft transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-cream/50">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
        <div>
          <p className="font-display text-xl text-cream">That is the whole rulebook.</p>
          <p className="mt-1 text-[12.5px] text-cream/45">
            {SQUAD_SIZE} players, one captain, three days. Everything else is vibes.
          </p>
        </div>
        <Link
          href="/draft"
          className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
        >
          Draft your six →
        </Link>
      </div>
    </div>
  );
}
