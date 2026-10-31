import Link from "next/link";
import type { ReactNode } from "react";
import { SIDE_COLOR, SIDE_LABEL, type Side } from "@/lib/data";

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`eyebrow text-gold/90 ${className}`}>{children}</p>
  );
}

export function TeamDot({ side, size = 8 }: { side: Side; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: SIDE_COLOR[side],
        boxShadow: `0 0 0 3px ${side === "europe" ? "rgba(111,155,234,0.16)" : "rgba(224,119,106,0.16)"}`,
      }}
    />
  );
}

export function TeamLabel({ side, className = "" }: { side: Side; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium ${className}`}>
      <TeamDot side={side} />
      {SIDE_LABEL[side]}
    </span>
  );
}

export function CountryChip({ code }: { code: string }) {
  return (
    <span className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-cream/70">
      {code}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "gold" | "muted";
}) {
  return (
    <div>
      <p className="eyebrow text-cream/60">{label}</p>
      <p
        className={`mt-1 font-display text-2xl tnum ${
          tone === "gold" ? "text-gold-soft" : tone === "muted" ? "text-cream/70" : "text-cream"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-cream/70">{sub}</p> : null}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-2 text-balance text-3xl text-cream sm:text-4xl">{title}</h2>
        {sub ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/70">{sub}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="group inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-sm font-medium text-gold-soft transition hover:border-gold hover:text-gold"
        >
          {action.label}
          <span aria-hidden className="transition group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      ) : null}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "solid",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "solid" | "ghost" | "cream";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition";
  const styles =
    variant === "solid"
      ? "bg-gold text-forest-950 hover:bg-gold-soft"
      : variant === "cream"
        ? "bg-cream text-forest-900 hover:bg-cream-soft"
        : "border border-cream/25 text-cream hover:border-cream/60 hover:bg-white/5";
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-white/10 ${className}`} />;
}

export function Flag({ code, country }: { code: string; country: string }) {
  const map: Record<string, [string, string, string]> = {
    IRL: ["#169b62", "#ffffff", "#ff883e"],
    NIR: ["#c8102e", "#ffffff", "#c8102e"],
    ENG: ["#ffffff", "#c8102e", "#ffffff"],
    SCO: ["#005eb8", "#ffffff", "#005eb8"],
    SWE: ["#006aa7", "#fecc00", "#006aa7"],
    NOR: ["#ba0c2f", "#ffffff", "#00205b"],
    DEN: ["#c8102e", "#ffffff", "#c8102e"],
    ESP: ["#aa151b", "#f1bf00", "#aa151b"],
    AUT: ["#ed2939", "#ffffff", "#ed2939"],
    USA: ["#3c3b6e", "#ffffff", "#b22234"],
  };
  const [a, b, c] = map[code] ?? ["#ffffff", "#cccccc", "#ffffff"];
  return (
    <span
      title={country}
      className="inline-block h-3 w-4.5 overflow-hidden rounded-[2px] border border-white/20"
      style={{
        background:
          code === "USA"
            ? `repeating-linear-gradient(180deg, ${c} 0 1.5px, ${b} 1.5px 3px)`
            : `linear-gradient(180deg, ${a} 0 33%, ${b} 33% 66%, ${c} 66% 100%)`,
        width: 18,
        height: 12,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
    />
  );
}
