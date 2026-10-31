import Link from "next/link";
import { ACTIVE_EDITION, PLATFORM } from "@/lib/tournaments";

export function Emblem({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect x="1" y="1" width="42" height="42" rx="12" fill="#071a13" />
      <rect
        x="1.75"
        y="1.75"
        width="40.5"
        height="40.5"
        rx="11.25"
        stroke="#c9a44c"
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <path d="M12 12.5h6" stroke="#c9a44c" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="33.5" cy="12" r="1.6" fill="#c9a44c" />
      <text
        x="22"
        y="29.5"
        textAnchor="middle"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="17"
        fontWeight="600"
        fill="#f5efe2"
        letterSpacing="-0.8"
      >
        28
      </text>
      <path
        d="M13.5 33.5h17"
        stroke="#c9a44c"
        strokeOpacity="0.5"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({
  compact = false,
  edition = true,
}: {
  compact?: boolean;
  edition?: boolean;
}) {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <Emblem size={compact ? 32 : 38} />
      <span className="leading-none">
        <span className="block font-display text-[17px] tracking-[0.005em] text-cream">
          {PLATFORM.name}
        </span>
        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.24em] text-cream/45">
          {edition ? `Cup fantasy · ${ACTIVE_EDITION.name}` : PLATFORM.tagline}
        </span>
      </span>
    </Link>
  );
}
