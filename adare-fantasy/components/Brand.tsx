import Link from "next/link";

export function Emblem({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect x="1" y="1" width="42" height="42" rx="12" stroke="#c9a44c" strokeOpacity="0.55" />
      <rect x="5" y="5" width="34" height="34" rx="9" stroke="#c9a44c" strokeOpacity="0.18" />
      <g fill="#e6cd94">
        <circle cx="22" cy="15.5" r="5.1" />
        <circle cx="15.6" cy="24.5" r="5.1" />
        <circle cx="28.4" cy="24.5" r="5.1" />
      </g>
      <path d="M22 24.5c0 4.6.6 7.4 2.4 9.6" stroke="#e6cd94" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="22" cy="20.6" r="1.7" fill="#0b2a20" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <Emblem size={compact ? 32 : 38} />
      <span className="leading-none">
        <span className="block font-display text-[17px] tracking-[0.02em] text-cream">
          Adare <span className="text-gold-soft">2027</span>
        </span>
        {!compact && (
          <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.26em] text-cream/45">
            Fantasy Ryder Cup
          </span>
        )}
      </span>
    </Link>
  );
}
