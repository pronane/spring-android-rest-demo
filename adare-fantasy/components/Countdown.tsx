"use client";

import { useEffect, useState } from "react";
import { TOURNAMENT } from "@/lib/data";

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function diff(target: number): Parts {
  const ms = Math.max(0, target - Date.now());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms / 3_600_000) % 24),
    minutes: Math.floor((ms / 60_000) % 60),
    seconds: Math.floor((ms / 1000) % 60),
  };
}

export function useCountdown() {
  const target = new Date(TOURNAMENT.firstTee).getTime();
  const [parts, setParts] = useState<Parts>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    setParts(diff(target));
    const timer = window.setInterval(() => setParts(diff(target)), 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  return parts;
}

export function Countdown({ compact = false }: { compact?: boolean }) {
  const { days, hours, minutes } = useCountdown();

  if (compact) {
    return (
      <span className="tnum text-sm text-cream/70">
        {days}d {hours}h {minutes}m
      </span>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Days", value: days },
        { label: "Hours", value: hours },
        { label: "Mins", value: minutes },
      ].map((part) => (
        <div key={part.label} className="rounded-xl border border-white/10 bg-forest-950/60 px-3 py-2.5">
          <p className="font-display text-2xl text-cream tnum">
            {String(part.value).padStart(2, "0")}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-cream/40">
            {part.label}
          </p>
        </div>
      ))}
    </div>
  );
}
