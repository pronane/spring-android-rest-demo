"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./Brand";
import { useFantasy } from "@/lib/store";
import { PLATFORM } from "@/lib/tournaments";

const LINKS = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/draft", label: "Draft", short: "Draft" },
  { href: "/predict", label: "Predict", short: "Predict" },
  { href: "/pinpoint", label: "Pinpoint", short: "Pin" },
  { href: "/live", label: "Live", short: "Live", live: true },
  { href: "/leagues", label: "Leagues", short: "Leagues" },
  { href: "/rules", label: "Rules", short: "Rules" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { state, projected, ready, paid } = useFantasy();
  const hasTeam = state.squad.length > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-forest-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Brand />

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition ${
                  active
                    ? "bg-white/[0.08] text-cream"
                    : "text-cream/60 hover:bg-white/[0.04] hover:text-cream"
                }`}
              >
                {link.label}
                {link.live ? (
                  <span className="relative flex h-1.5 w-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-usa opacity-70 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-usa" />
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/editions"
            className="hidden items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-cream/60 transition hover:border-gold/40 hover:text-cream xl:flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Adare 2027
            <span className="text-cream/60">/</span>
            <span className="text-cream/60">5 editions</span>
          </Link>

          {hasTeam ? (
            <Link
              href="/team"
              className="hidden items-center gap-3 rounded-full border border-white/12 bg-white/[0.04] py-1.5 pl-3 pr-1.5 transition hover:border-gold/40 sm:flex"
            >
              <span className="text-left leading-tight">
                <span className="block max-w-[130px] truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-cream/60">
                  {state.teamName}
                </span>
                <span className="block text-[12px] font-medium text-cream/85">
                  {ready ? `${projected.toFixed(1)} pts projected` : "Your card"}
                </span>
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gold/15 text-gold-soft">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M8 1.5 9.9 5.6l4.5.6-3.3 3.1.8 4.5L8 11.7 4.1 13.8l.8-4.5L1.6 6.2l4.5-.6L8 1.5Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </Link>
          ) : null}

          <Link
            href={paid ? "/team" : "/enter"}
            className="rounded-full bg-gold px-4 py-2 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
          >
            {paid ? "My card" : "Play free"}
          </Link>
        </div>
      </div>

      <div className="border-t border-white/[0.06] lg:hidden">
        <nav aria-label="Primary (compact)" className="no-scrollbar mx-auto flex max-w-7xl items-center gap-0.5 overflow-x-auto px-3 py-1.5">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-medium transition ${
                  active ? "bg-white/10 text-cream" : "text-cream/70"
                }`}
              >
                {link.short}
                {link.live ? <span aria-hidden className="h-1 w-1 rounded-full bg-usa" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <span className="sr-only">{PLATFORM.tagline}</span>
    </header>
  );
}
