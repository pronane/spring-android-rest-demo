import Link from "next/link";
import { TOURNAMENT } from "@/lib/data";
import { Emblem } from "./Brand";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-forest-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-10">
        <div>
          <div className="flex items-center gap-3">
            <Emblem size={34} />
            <div>
              <p className="font-display text-base text-cream">
                Adare <span className="text-gold-soft">2027</span>
              </p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-cream/40">
                Fantasy Ryder Cup
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-cream/45">
            A fantasy league built around the {TOURNAMENT.edition} at {TOURNAMENT.venue},{" "}
            {TOURNAMENT.village}. Pick six players, name a captain, beat your mates.
          </p>
        </div>

        <FooterCol
          title="Play"
          links={[
            { href: "/draft", label: "Draft your six" },
            { href: "/team", label: "My team" },
            { href: "/players", label: "Player pool" },
            { href: "/leagues", label: "Mini-leagues" },
          ]}
        />
        <FooterCol
          title="Game"
          links={[
            { href: "/rules", label: "Scoring rules" },
            { href: "/rules#format", label: "The format" },
            { href: "/rules#faq", label: "FAQ" },
          ]}
        />
        <div>
          <p className="eyebrow text-cream/40">The week</p>
          <ul className="mt-4 space-y-2 text-[13px] text-cream/55">
            <li>{TOURNAMENT.weekLabel}</li>
            <li>{TOURNAMENT.venue}</li>
            <li>{TOURNAMENT.village}</li>
            <li className="pt-2 text-cream/40">
              Europe captain · {TOURNAMENT.captains.europe}
            </li>
            <li className="text-cream/40">USA captain · {TOURNAMENT.captains.usa}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-[11px] text-cream/35 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p>
            Draft v0.1 · An independent fan project. Not affiliated with the Ryder Cup, DP World
            Tour, PGA of America or Adare Manor.
          </p>
          <p>Built for the 100th anniversary · {TOURNAMENT.holders} hold the cup</p>
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
      <p className="eyebrow text-cream/40">{title}</p>
      <ul className="mt-4 space-y-2 text-[13px]">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-cream/55 transition hover:text-gold-soft">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
