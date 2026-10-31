"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./Brand";
import { useFantasy } from "@/lib/store";

const LINKS = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/team", label: "My team", short: "Team" },
  { href: "/draft", label: "Draft", short: "Draft" },
  { href: "/players", label: "Players", short: "Players" },
  { href: "/leagues", label: "Leagues", short: "Leagues" },
  { href: "/rules", label: "Scoring", short: "Scoring" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { state, projected, ready } = useFantasy();
  const hasTeam = state.squad.length > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-forest-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Brand />

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition ${
                  active
                    ? "bg-white/[0.08] text-cream"
                    : "text-cream/60 hover:bg-white/[0.04] hover:text-cream"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/team"
            className="hidden items-center gap-3 rounded-full border border-white/12 bg-white/[0.04] py-1.5 pl-3 pr-1.5 transition hover:border-gold/40 sm:flex"
          >
            <span className="text-left leading-tight">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-cream/40">
                {hasTeam ? state.teamName : "No team yet"}
              </span>
              <span className="block text-[12px] font-medium text-cream/85">
                {hasTeam ? `${ready ? projected.toFixed(1) : "—"} pts projected` : "Draft your six"}
              </span>
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-gold/15 text-gold-soft">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 1.5 9.9 5.6l4.5.6-3.3 3.1.8 4.5L8 11.7 4.1 13.8l.8-4.5L1.6 6.2l4.5-.6L8 1.5Z" fill="currentColor" />
              </svg>
            </span>
          </Link>
          <Link
            href={hasTeam ? "/team" : "/draft"}
            className="rounded-full bg-gold px-4 py-2 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
          >
            {hasTeam ? "My team" : "Start"}
          </Link>
        </div>
      </div>

      <div className="relative border-t border-white/[0.06] lg:hidden">
        <nav className="no-scrollbar mx-auto flex max-w-7xl items-center gap-0.5 overflow-x-auto px-3 py-1.5">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11.5px] font-medium transition ${
                  active ? "bg-white/10 text-cream" : "text-cream/55"
                }`}
              >
                {link.short}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
