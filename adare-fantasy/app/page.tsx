import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { HomeTeamCard } from "@/components/HomeTeamCard";
import { LeagueTable } from "@/components/LeagueTable";
import { ButtonLink, CountryChip, Eyebrow, SectionHead, Stat, TeamDot } from "@/components/ui";
import { GLOBAL_TOP, LEAGUES, PLAYERS, SCHEDULE, SCORING, type Player } from "@/lib/data";
import { credits } from "@/lib/helpers";
import { simState } from "@/lib/sim";
import {
  ACTIVE_EDITION,
  EDITIONS,
  ENTRY_FEE,
  MODE_LIST,
  PLATFORM,
  PRIZE_SPLIT,
  SPONSORS,
} from "@/lib/tournaments";

const WAYS = [
  {
    href: "/draft",
    tag: "01 · Draft",
    title: "Build a card",
    body: "Classic Six on a 100m budget, or a full Captain's Dozen at 200m. Mix Europe and the USA — you cannot hide behind one badge.",
    cta: "Open the draft room",
  },
  {
    href: "/predict",
    tag: "02 · Predict",
    title: "Call all 28",
    body: "A winner for every match, a halve if you fancy it, plus MVP, top scorer and rookie of the week. Included in the entry.",
    cta: "Make your calls",
  },
  {
    href: "/live",
    tag: "03 · Live",
    title: "Watch it settle",
    body: "Live points, league tables that move with every putt, and a wire feed of every birdie. Sunday afternoon, in your pocket.",
    cta: "See the live board",
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
  const top = GLOBAL_TOP.slice(0, 5);
  const teaser = simState(3080);

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
                {ACTIVE_EDITION.name} · {ACTIVE_EDITION.editionLabel ?? "46th Ryder Cup"}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cream/70">
                {ACTIVE_EDITION.matchesLabel}
              </span>
            </div>

            <h1 className="mt-6 max-w-2xl text-balance font-display text-[36px] leading-[1.04] tracking-[-0.02em] text-cream sm:text-[52px] lg:text-[64px]">
              Six picks.
              <br />
              Twenty-eight matches.
              <br />
              <span className="text-gold-soft">One very Irish week.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-cream/65">
              {PLATFORM.name} is the fantasy game for the Ryder Cup. Draft a card, call all 28
              matches, and follow every point live from Adare Manor — the 100th anniversary of the
              matches.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/enter">Enter · €{ENTRY_FEE}</ButtonLink>
              <ButtonLink href="/draft" variant="ghost">
                Draft free first
              </ButtonLink>
            </div>

            <div className="mt-12 grid max-w-lg grid-cols-2 gap-x-6 gap-y-6 border-t border-white/10 pt-6 sm:grid-cols-4">
              <Stat label="Players" value="24" sub="12 per side" />
              <Stat label="Modes" value="2" sub="six or twelve" />
              <Stat label="Matches" value="28" sub="8 · 8 · 12" />
              <Stat label="Entry" value={`€${ENTRY_FEE}`} sub="card + predictor" tone="gold" />
            </div>
          </div>

          <div className="relative space-y-3">
            <div className="panel grain relative overflow-hidden rounded-2xl p-5 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <Eyebrow>First tee</Eyebrow>
                <span className="text-[10px] uppercase tracking-[0.16em] text-cream/60">
                  {ACTIVE_EDITION.venue} · 1st
                </span>
              </div>
              <p className="mt-2 font-display text-xl text-cream">Entries close in</p>
              <div className="mt-3">
                <Countdown />
              </div>
              <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-[12px]">
                <Row label="Draft deadline" value="Fri 17 Sep · 07:35 IST" />
                <Row label="Cup holders" value="Europe · 15–13" dot="europe" />
                <Row label="Europe need" value="14 to retain" />
              </div>
            </div>

            <Link
              href="/live"
              className="flex items-center justify-between rounded-2xl border border-usa/30 bg-usa/[0.07] px-4 py-3 transition hover:border-usa/60"
            >
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-usa opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-usa" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-usa">
                    Live demo
                  </p>
                  <p className="text-[12px] text-cream/70">
                    {teaser.heading} · {teaser.clock.split(" · ")[1]}
                  </p>
                </div>
              </div>
              <span className="font-display text-lg text-cream tnum">
                {teaser.cup.europe}–{teaser.cup.usa}
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ——— WAYS TO PLAY ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
        <SectionHead
          eyebrow="The game"
          title="Three ways in, one entry fee"
          sub="Draft a card, call the matches, then watch it settle. No weekly tinkering and no price rises at 2am — one squad, one armband, three days."
          action={{ href: "/rules", label: "Full rules" }}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {WAYS.map((way) => (
            <Link
              key={way.href}
              href={way.href}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-6 transition hover:border-gold/30 hover:bg-white/[0.04]"
            >
              <span className="font-display text-[12px] uppercase tracking-[0.18em] text-gold/85">
                {way.tag}
              </span>
              <h3 className="mt-3 text-xl text-cream">{way.title}</h3>
              <p className="mt-2.5 text-[13px] leading-relaxed text-cream/70">{way.body}</p>
              <span className="mt-5 flex items-center gap-1.5 text-[12px] text-gold-soft/80 transition group-hover:text-gold">
                {way.cta} <span aria-hidden>→</span>
              </span>
              <span
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gold/[0.06] blur-2xl"
              />
            </Link>
          ))}
        </div>
      </section>

      {/* ——— YOUR CARD + LEADERBOARD ——— */}
      <section className="border-y border-white/10 bg-forest-900/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-10 lg:py-20">
          <div>
            <Eyebrow>Your card</Eyebrow>
            <h2 className="mt-2 text-3xl text-cream sm:text-4xl">Built for the group chat</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-cream/70">
              Set up a private league for the lads with a buy-in and a sponsor, or climb the open
              table with a few thousand strangers.
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
            <p className="mt-3 text-[11px] text-cream/60">
              Projected points before a ball is struck. The table locks at the first tee.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="eyebrow text-cream/60">Featured mini-league</p>
                  <p className="mt-1 font-display text-lg text-cream">{LEAGUES[0].name}</p>
                  <p className="mt-1 max-w-sm text-[12px] text-cream/70">{LEAGUES[0].blurb}</p>
                  <p className="mt-1 text-[11px] text-cream/60">
                    €{LEAGUES[0].buyIn} buy-in · sponsored by {LEAGUES[0].sponsor}
                  </p>
                </div>
                <div className="rounded-xl border border-gold/30 bg-gold/[0.07] px-4 py-3 text-center">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-cream/60">Join code</p>
                  <p className="mt-1 font-display text-xl tracking-[0.18em] text-gold-soft">
                    {LEAGUES[0].code}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— PRIZES ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Eyebrow>Entry & prizes</Eyebrow>
            <h2 className="mt-2 text-3xl text-cream sm:text-4xl">
              €10 in. Ninety-five per cent out.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-cream/70">
              One payment covers the card game, the 28-match predictor and every league you join.
              Private leagues can layer their own buy-in and sponsor pot on top.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {MODE_LIST.map((mode) => (
                <div
                  key={mode.id}
                  className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
                >
                  <p className="text-[12.5px] font-medium text-cream">{mode.name}</p>
                  <p className="mt-1 text-[11px] text-cream/70">
                    {mode.squadSize} picks · {mode.budget}m · max {mode.maxPerSide} per side
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {PRIZE_SPLIT.slice(0, 5).map((row) => (
                <span
                  key={row.label}
                  className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-cream/70"
                >
                  {row.label} · {Math.round(row.share * 100)}%
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/enter">Enter Adare 2027</ButtonLink>
              <ButtonLink href="/editions" variant="ghost">
                See all editions
              </ButtonLink>
            </div>
          </div>

          <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-5">
            <p className="eyebrow text-cream/60">Live seasons, one platform</p>
            <p className="mt-1 font-display text-2xl text-gold-soft">5 editions</p>
            <p className="text-[11.5px] text-cream/70">
              Adare 2027 is live. Hazeltine and Camiral are queued; Bethpage and Rome are archived
              for replays.
            </p>
            <ul className="mt-4 space-y-2">
              {EDITIONS.slice(0, 4).map((edition) => (
                <li key={edition.id} className="flex items-center gap-2.5 text-[12px]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: edition.accent }}
                  />
                  <span className="flex-1 text-cream/75">{edition.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-cream/60">
                    {edition.status}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cream/60">Sponsors</p>
              <ul className="mt-2 space-y-1.5">
                {SPONSORS.map((s) => (
                  <li key={s.name} className="text-[11.5px] text-cream/70">
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ——— FIELD ——— */}
      <section className="border-t border-white/10 bg-forest-900/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
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
              captain={ACTIVE_EDITION.captains.europe}
              players={europe}
            />
            <FieldPanel
              side="usa"
              title="Team USA"
              captain={ACTIVE_EDITION.captains.usa}
              players={usa}
            />
          </div>
        </div>
      </section>

      {/* ——— VENUE ——— */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
        <div className="panel-cream relative overflow-hidden rounded-3xl p-8 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-gold/20 blur-3xl"
          />
          <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="eyebrow text-forest-700/85">The venue</p>
              <h2 className="mt-3 max-w-xl text-balance font-display text-3xl leading-tight text-forest-900 sm:text-[42px]">
                A 19th-century manor, a Fazio monster, and Ireland&apos;s first Ryder Cup in
                twenty-one years.
              </h2>
              <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-forest-900/70">
                Adare Manor sits in the middle of an 840-acre estate in County Limerick, twenty
                minutes from Shannon. Tom Fazio rebuilt the course in 2018 into 7,509 yards of
                generous fairways and terrifying greens — the kind of place where the home crowd is
                worth half a point a session.
              </p>
              <blockquote className="mt-6 border-l-2 border-gold pl-4 font-display text-[17px] italic leading-snug text-forest-900/85">
                “The Irish have been waiting since the K Club. Adare will be the loudest week golf
                has seen.”
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
                  <dt className="text-[9.5px] uppercase tracking-[0.16em] text-forest-900/70">
                    {item.k}
                  </dt>
                  <dd className="mt-1 font-display text-2xl text-forest-900 tnum">{item.v}</dd>
                  <dd className="text-[11px] text-forest-900/70">{item.s}</dd>
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
                  <span className="text-[10px] uppercase tracking-[0.16em] text-cream/60">
                    {day.label}
                  </span>
                </div>
                <ul className="mt-4 space-y-3">
                  {day.sessions.map((session) => (
                    <li key={session.name} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] text-cream/85">{session.name}</p>
                        <p className="text-[11px] text-cream/60">{session.detail}</p>
                      </div>
                      <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] text-cream/70 tnum">
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
                <p className="text-[10px] uppercase tracking-[0.14em] text-cream/70">{chip.label}</p>
                <p className="font-display text-xl text-gold-soft tnum">{chip.value}</p>
                <p className="text-[10.5px] text-cream/60">{chip.sub}</p>
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
                Your card is waiting. The first tee is not.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-cream/70">
                €{ENTRY_FEE} entry · card, predictor and live scoring included · {credits(0)}m left
                if you do nothing at all.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/enter" variant="cream">
                Enter Adare 2027
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

function Row({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot?: "europe" | "usa";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-cream/70">{label}</span>
      <span className="flex items-center gap-1.5 text-cream/85">
        {dot ? <TeamDot side={dot} size={7} /> : null}
        {value}
      </span>
    </div>
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
  players: Player[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <TeamDot side={side} size={9} />
          <div>
            <p className="text-[14px] font-medium text-cream">{title}</p>
            <p className="text-[11px] text-cream/60">Captain · {captain}</p>
          </div>
        </div>
        <span className="rounded-full border border-white/12 px-2.5 py-1 text-[10px] text-cream/70">
          12 players
        </span>
      </div>
      <ul>
        {players.map((player, index) => (
          <li
            key={player.id}
            className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3 last:border-0"
          >
            <span className="w-4 text-[10px] text-cream/60 tnum">{index + 1}</span>
            <CountryChip code={player.countryCode} />
            <Link
              href="/players"
              className="flex-1 truncate text-[13.5px] text-cream/85 transition hover:text-gold-soft"
            >
              {player.name}
            </Link>
            <span className="hidden text-[11px] text-cream/60 sm:block">{credits(player.price)}m</span>
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
