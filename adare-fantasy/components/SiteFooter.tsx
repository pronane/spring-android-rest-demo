import Link from "next/link";
import { ACTIVE_EDITION, EDITIONS, PLATFORM } from "@/lib/tournaments";
import { Emblem } from "./Brand";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-forest-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-10">
        <div>
          <div className="flex items-center gap-3">
            <Emblem size={34} />
            <div>
              <p className="font-display text-base text-cream">{PLATFORM.name}</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-cream/60">
                Cup fantasy · est. 2026
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-cream/70">
            {PLATFORM.description} Currently playing: {ACTIVE_EDITION.name} — {ACTIVE_EDITION.venue},{" "}
            {ACTIVE_EDITION.village}.
          </p>
          <p className="mt-4 text-[11px] text-cream/60">{PLATFORM.domain}</p>
        </div>

        <FooterCol
          title="Play"
          links={[
            { href: "/draft", label: "Draft your card" },
            { href: "/predict", label: "Match predictor" },
            { href: "/live", label: "Live scoring" },
            { href: "/team", label: "My card" },
            { href: "/players", label: "Player pool" },
          ]}
        />
        <FooterCol
          title="Platform"
          links={[
            { href: "/editions", label: "All editions" },
            { href: "/enter", label: "Entry & prizes" },
            { href: "/rules", label: "Rules & scoring" },
            { href: "/rules#data", label: "Data sources" },
            { href: "/leagues", label: "Mini-leagues" },
            { href: "/leaderboard", label: "The table" },
            { href: "/admin", label: "Operator console" },
          ]}
        />
        <div>
          <p className="eyebrow text-cream/60">Editions</p>
          <ul className="mt-4 space-y-2 text-[13px] text-cream/70">
            {EDITIONS.map((edition) => (
              <li key={edition.id}>
                <Link href="/editions" className="transition hover:text-gold-soft">
                  {edition.name}
                  {edition.status === "upcoming" ? (
                    <span className="ml-1.5 text-[10px] text-cream/60">soon</span>
                  ) : null}
                  {edition.status === "archive" ? (
                    <span className="ml-1.5 text-[10px] text-cream/60">archive</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-[11px] text-cream/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p>
            v0.7 · Fan project. Not affiliated with the Ryder Cup, DP World Tour, PGA of America or
            Adare Manor. Demo checkout — no card is ever charged unless Stripe keys are set.
          </p>
          <p>Tournament facts via Wikipedia / Wikidata · conditions via Open-Meteo</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="eyebrow text-cream/60">{title}</p>
      <ul className="mt-4 space-y-2 text-[13px]">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-cream/70 transition hover:text-gold-soft">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
