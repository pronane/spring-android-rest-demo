import Link from "next/link";
import { Eyebrow } from "@/components/ui";
import { ACTIVE_EDITION, EDITIONS, PLATFORM, type Edition } from "@/lib/tournaments";

const STATUS_LABEL: Record<Edition["status"], string> = {
  open: "Entries open",
  upcoming: "Opens later",
  archive: "Archive",
};

export default function EditionsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="max-w-2xl">
        <Eyebrow>{PLATFORM.name} · platform</Eyebrow>
        <h1 className="mt-2 text-4xl text-cream sm:text-5xl">One game. Every cup.</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-cream/55">
          Each Ryder Cup is an edition: its own venue art, its own field, its own prize pool — the
          same card, predictor and scoring engine underneath. Adare 2027 is the live edition; the
          rest are queued.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {EDITIONS.map((edition) => {
          const active = edition.id === ACTIVE_EDITION.id;
          return (
            <article
              key={edition.id}
              className={`relative overflow-hidden rounded-2xl border p-5 transition ${
                active
                  ? "border-gold/45 bg-gold/[0.06]"
                  : "border-white/10 bg-white/[0.025] hover:border-white/25"
              }`}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: edition.accent, opacity: active ? 1 : 0.4 }}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cream/35">
                    {edition.year} · {edition.country}
                  </p>
                  <h2 className="mt-1 font-display text-2xl text-cream">{edition.name}</h2>
                  <p className="text-[12px] text-cream/45">
                    {edition.venue} · {edition.village}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] ${
                    active
                      ? "border-gold/50 bg-gold/15 text-gold-soft"
                      : "border-white/15 text-cream/45"
                  }`}
                >
                  {STATUS_LABEL[edition.status]}
                </span>
              </div>

              <p className="mt-3 text-[12.5px] leading-relaxed text-cream/50">{edition.blurb}</p>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <dt className="text-cream/30">Matches</dt>
                  <dd className="text-cream/70">{edition.matchesLabel}</dd>
                </div>
                <div>
                  <dt className="text-cream/30">Captains</dt>
                  <dd className="text-cream/70">
                    {edition.captains.europe} / {edition.captains.usa}
                  </dd>
                </div>
                {edition.result ? (
                  <div className="col-span-2">
                    <dt className="text-cream/30">Result</dt>
                    <dd className="text-gold-soft">{edition.result}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-[10.5px] text-cream/30">
                  {edition.fieldReady ? "Field archived" : "Field projected"}
                </span>
                {active ? (
                  <Link
                    href="/enter"
                    className="rounded-full bg-gold px-4 py-1.5 text-[11.5px] font-semibold text-forest-950 transition hover:bg-gold-soft"
                  >
                    Enter this edition
                  </Link>
                ) : edition.status === "archive" ? (
                  <span className="text-[10px] uppercase tracking-[0.16em] text-cream/30">
                    Result archived
                  </span>
                ) : (
                  <span className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-cream/45">
                    Notify me
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-8 panel-cream rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-lg">
            <p className="eyebrow text-forest-700/60">How the re-skin works</p>
            <h2 className="mt-2 font-display text-2xl text-forest-900">
              A venue is a config file, not a rewrite.
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-forest-900/70">
              Colours, hero art, venue copy, captains, field snapshot, prize pool and the free data
              sources all live in <code className="rounded bg-forest-900/10 px-1">lib/tournaments.ts</code>{" "}
              plus a snapshot. The game engine, scoring, predictor and leagues are shared, so
              Hazeltine 2029 goes live as a data change.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-forest-900">
            {[
              ["Editions configured", String(EDITIONS.length)],
              ["Live now", "1"],
              ["Shared engine", "1"],
              ["Rewrite required", "0"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-forest-900/12 px-4 py-3">
                <p className="text-[9.5px] uppercase tracking-[0.14em] text-forest-900/45">{label}</p>
                <p className="font-display text-2xl tnum">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
