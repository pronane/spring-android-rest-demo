import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { HomeTeamCard } from "@/components/HomeTeamCard";
import { LeagueTable } from "@/components/LeagueTable";
import { ButtonLink, CountryChip, Eyebrow, SectionHead, Stat, TeamDot } from "@/components/ui";
import {
  GLOBAL_TOP,
  LEAGUES,
  PLAYERS,
  SCHEDULE,
  SCORING,
  SQUAD_SIZE,
  TOURNAMENT,
  BUDGET,
} from "@/lib/data";
import { credits } from "@/lib/helpers";

const STEPS = [
  {
    n: "01",
    title: "Draft your six",
    body: "Twenty-four projected players, one 100m budget, four per side maximum. Mix Europe and the USA — you cannot hide behind one team.",
  },
  {
    n: "02",
    title: "Name a captain",
    body: "Your armband doubles every point that player wins. Spend it on Scheffler and hope, or on Lowry and let the home crowd carry you.",
  },
  {
    n: "03",
    title: "Ride the singles",
    body: "Foursomes, fourball, then twelve Sunday singles. Every win, half, birdie and eagle lands in your total. The cup is decided Sunday evening.",
  },
];

export default function HomePage() {
  const europe = [...PLAYERS]
    .filter((p) => p.side === "europe")
    .sort((a, b) => b.price - a.price)
    .slice(0, 6);
  const usa = [...PLAYERS]
    .filter((p) => p.side === "usa")
    .sort((a, b) => b.price - a.price)
    .slice(0, 6);
  const top = [...GLOBAL_TOP.slice(0, 5)];

  return (
    <>
      {/* ——— HERO ——— */}
      <section className="relative overflow-hidden border-b border-white/10">
        <img
          src="/hero-adare.jpg"
          alt="Adare Manor at dusk beyond the golf course"
          className="absolute inset-0 h-full w-full object-cover object-[62%_50%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-forest-950 via-forest-950/85 to-forest-950/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-transparent to-forest-950/60" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:px-10 lg:py-24">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
                {TOURNAMENT.edition} · 100th anniversary
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cream/50">
                {TOURNAMENT.matchesLabel}
              </span>
            </div>

            <h1 className="mt-6 max-w-2xl text-balance font-display text-[36px] leading-[1.04] tracking-[-0.02em] text-cream sm:text-[52px] lg:text-[66px]">
              Six picks.
              <br />
              Twenty-eight matches.
              <br />
              <span className="text-gold-soft">One very Irish week.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-cream/65">
              The fantasy league for the Ryder Cup at Adare Manor. Draft six players from Europe
              and the USA, name your captain, and take on your mates across three days in County
              Limerick.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/draft">Draft your six →</ButtonLink>
              <ButtonLink href="/rules" variant="ghost">
                How scoring works
              </ButtonLink>
            </div>

            <dl className="mt-12 grid max-w-lg grid-cols-2 gap-x-6 gap-y-6 border-t border-white/10 pt-6 sm:grid-cols-4">
              <Stat label="Players" value="24" sub="12 per side" />
              <Stat label="Budget" value={`${BUDGET}m`} sub="for six picks" />
              <Stat label="Matches" value="28" sub="8 · 8 · 12" />
              <Stat label="Entry" value="Free" sub="no card needed" tone="gold" />
            </dl>
          </div>

          <div className="relative">
            <div className="panel grain relative overflow-hidden rounded-2xl p-5 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <Eyebrow>First tee</Eyebrow>
                <span className="text-[10px] uppercase tracking-[0.16em] text-cream/40">
                  Adare Manor · 1st
                </span>
              </div>
              <p className="mt-2 font-display text-xl text-cream">Entries close in</p>
              <div className="mt-4">
                <Countdown />
              </div>
              <div className="mt-5 space-y-2.5 border-t border-white/10 pt-4 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-cream/45">Draft deadline</span>
                  <span className="text-cream/85">{TOURNAMENT.deadlineLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-cream/45">Cup holders</span>
                  <span className="flex items-center gap-1.5 text-cream/85">
                    <TeamDot side="europe" size={7} /> Europe · 15–13
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-cream/45">Europe need</span>
                  <span className="text-cream/85">{TOURNAMENT.retainAt} to retain</span>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-white/[0.04] p-3 text-[11px] leading-relaxed text-cream/45">
                Field is projected. Squads lock when Donald and Furyk name their picks in the
                week of 30 August 2027.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ——— HOW IT WORKS ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
        <SectionHead
          eyebrow="The game"
          title="A captain's job in three moves"
          sub="No weekly tinkering, no price rises at 2am. One squad, one armband, and three days of golf that decide everything."
          action={{ href: "/rules", label: "Full rules" }}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-6 transition hover:border-gold/30 hover:bg-white/[0.04]"
            >
              <span className="font-display text-[13px] tracking-[0.2em] text-gold/70">{step.n}</span>
              <h3 className="mt-4 text-xl text-cream">{step.title}</h3>
              <p className="mt-2.5 text-[13px] leading-relaxed text-cream/50">{step.body}</p>
              <span
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-8 font-display text-[86px] text-white/[0.035] tnum"
              >
                {step.n}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ——— YOUR TEAM + LEADERBOARD ——— */}
      <section className="border-y border-white/10 bg-forest-900/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-10 lg:py-20">
          <div>
            <Eyebrow>Your card</Eyebrow>
            <h2 className="mt-2 text-3xl text-cream sm:text-4xl">Built for the group chat</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-cream/55">
              Every card is scored live across the three days. Set up a private league for the
              lads, or climb the open table with a few thousand strangers.
            </p>
            <div className="mt-6">
              <HomeTeamCard />
            </div>
          </div>

          <div className="lg:pt-12">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <Eyebrow>Global</Eyebrow>
                <h3 className="mt-1.5 text-2xl text-cream">Top of the open table</h3>
              </div>
              <Link href="/leagues" className="text-[12.5px] text-gold-soft hover:text-gold">
                All leagues →
              </Link>
            </div>
            <LeagueTable members={top} dense />
            <p className="mt-3 text-[11px] text-cream/35">
              Projected points before a ball is struck. The table locks at the first tee.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="eyebrow text-cream/40">Featured mini-league</p>
                  <p className="mt-1 font-display text-lg text-cream">{LEAGUES[0].name}</p>
                  <p className="mt-1 max-w-sm text-[12px] text-cream/45">{LEAGUES[0].blurb}</p>
                </div>
                <div className="rounded-xl border border-gold/30 bg-gold/[0.07] px-4 py-3 text-center">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-cream/40">Join code</p>
                  <p className="mt-1 font-display text-xl tracking-[0.18em] text-gold-soft">
                    {LEAGUES[0].code}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— THE FIELD ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
        <SectionHead
          eyebrow="The field"
          title="Twenty-four names, two badges"
          sub="Prices are set by the projection model. The premium sits on the five-match players — the ones the captains will not rest."
          action={{ href: "/players", label: "Browse the full pool" }}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          <FieldPanel
            side="europe"
            title="Team Europe"
            captain={TOURNAMENT.captains.europe}
            players={europe}
          />
          <FieldPanel
            side="usa"
            title="Team USA"
            captain={TOURNAMENT.captains.usa}
            players={usa}
          />
        </div>
      </section>

      {/* ——— ADARE MANOR ——— */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-10 lg:pb-24">
        <div className="panel-cream relative overflow-hidden rounded-3xl p-8 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-gold/20 blur-3xl"
          />
          <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="eyebrow text-forest-700/60">The venue</p>
              <h2 className="mt-3 max-w-xl text-balance font-display text-3xl leading-tight text-forest-900 sm:text-[42px]">
                A 19th-century manor, a Fazio monster, and Ireland&apos;s first Ryder Cup in
                twenty-one years.
              </h2>
              <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-forest-900/70">
                Adare Manor sits in the middle of a 840-acre estate in County Limerick, twenty
                minutes from Shannon. Tom Fazio rebuilt the course in 2018 into 7,509 yards of
                generous fairways and terrifying greens — the kind of place where the home crowd
                is worth half a point a session.
              </p>
              <blockquote className="mt-6 border-l-2 border-gold pl-4 font-display text-[17px] italic leading-snug text-forest-900/85">
                “The Irish have been waiting since the K Club. Adare will be the loudest week
                golf has seen.”
              </blockquote>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/players"
                  className="rounded-full bg-forest-900 px-5 py-2.5 text-[13px] font-semibold text-cream transition hover:bg-forest-800"
                >
                  Scout the field
                </Link>
                <Link
                  href="/rules#format"
                  className="rounded-full border border-forest-900/25 px-5 py-2.5 text-[13px] font-semibold text-forest-900 transition hover:bg-forest-900/5"
                >
                  The 28-match format
                </Link>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 self-center">
              {[
                { k: "Par", v: "72", s: "7,509 yards" },
                { k: "Opened", v: "1720s", s: "Manor house" },
                { k: "Redesign", v: "2018", s: "Tom Fazio" },
                { k: "Gallery", v: "40k", s: "per day, projected" },
              ].map((item) => (
                <div
                  key={item.k}
                  className="rounded-xl border border-forest-900/12 bg-forest-900/[0.035] p-4"
                >
                  <dt className="text-[9.5px] uppercase tracking-[0.16em] text-forest-900/45">
                    {item.k}
                  </dt>
                  <dd className="mt-1 font-display text-2xl text-forest-900 tnum">{item.v}</dd>
                  <dd className="text-[11px] text-forest-900/50">{item.s}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ——— FORMAT ——— */}
      <section className="border-t border-white/10 bg-forest-900/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
          <SectionHead
            eyebrow="The format"
            title="Twenty-eight points, three days"
            sub="Europe need 14 to retain. The USA need 14.5 to win it back. Here is where your players earn them."
            action={{ href: "/rules", label: "Scoring detail" }}
          />
          <div className="grid gap-4 md:grid-cols-3">
            {SCHEDULE.map((day) => (
              <div key={day.day} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg text-cream">{day.day}</h3>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-cream/35">
                    {day.label}
                  </span>
                </div>
                <ul className="mt-4 space-y-3">
                  {day.sessions.map((session) => (
                    <li key={session.name} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] text-cream/85">{session.name}</p>
                        <p className="text-[11px] text-cream/40">{session.detail}</p>
                      </div>
                      <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] text-cream/55 tnum">
                        {session.points} pt
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 rounded-2xl border border-gold/20 bg-gold/[0.05] p-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Match win", value: `+${SCORING.foursomes.win}`, sub: `singles +${SCORING.singles.win}` },
              { label: "Match halved", value: `+${SCORING.foursomes.half}`, sub: `singles +${SCORING.singles.half}` },
              { label: "Eagle", value: `+${SCORING.eagle}`, sub: `birdie +${SCORING.birdie}` },
              { label: "Armband", value: "×2", sub: "all match points" },
            ].map((chip) => (
              <div key={chip.label} className="flex items-baseline justify-between gap-3 sm:block">
                <p className="text-[10px] uppercase tracking-[0.14em] text-cream/45">{chip.label}</p>
                <p className="font-display text-xl text-gold-soft tnum">{chip.value}</p>
                <p className="text-[10.5px] text-cream/35">{chip.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ——— CTA ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-forest-800/60 p-8 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(201,164,76,0.16),transparent_55%)]"
          />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <Eyebrow>Ready when you are</Eyebrow>
              <h2 className="mt-2 text-balance text-3xl text-cream sm:text-4xl">
                Your six are waiting. Pick them before the first tee.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-cream/55">
                {SQUAD_SIZE} players · {BUDGET}m budget · free to play · {credits(0)}m left if you
                do nothing at all.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/draft" variant="cream">
                Start my squad
              </ButtonLink>
              <ButtonLink href="/leagues" variant="ghost">
                Create a league
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function FieldPanel({
  side,
  title,
  captain,
  players,
}: {
  side: "europe" | "usa";
  title: string;
  captain: string;
  players: typeof PLAYERS;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <TeamDot side={side} size={9} />
          <div>
            <p className="text-[14px] font-medium text-cream">{title}</p>
            <p className="text-[11px] text-cream/40">Captain · {captain}</p>
          </div>
        </div>
        <span className="rounded-full border border-white/12 px-2.5 py-1 text-[10px] text-cream/50">
          12 players
        </span>
      </div>
      <ul>
        {players.map((player, index) => (
          <li
            key={player.id}
            className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3 last:border-0"
          >
            <span className="w-4 text-[10px] text-cream/25 tnum">{index + 1}</span>
            <CountryChip code={player.countryCode} />
            <Link
              href="/players"
              className="flex-1 truncate text-[13.5px] text-cream/85 transition hover:text-gold-soft"
            >
              {player.name}
            </Link>
            <span className="hidden text-[11px] text-cream/35 sm:block">{credits(player.price)}m</span>
            <span className="tnum rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-gold-soft">
              {player.projected} <span className="text-[9px] text-gold-soft/60">proj</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 px-5 py-3">
        <Link
          href="/players"
          className="text-[11.5px] font-medium text-gold-soft/80 transition hover:text-gold"
        >
          Full {title} pool →
        </Link>
      </div>
    </div>
  );
}
