import { compass, conditionsSummary } from "@/lib/providers";

export function ConditionsCard({ compact = false }: { compact?: boolean }) {
  const c = conditionsSummary();
  const observed = c.observedAt ? new Date(c.observedAt) : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-cream/60">Conditions at Adare</p>
        <span className="rounded-full border border-white/12 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.12em] text-cream/60">
          snapshot
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="font-display text-2xl text-cream tnum">{c.temperatureC ?? "—"}°</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-cream/60">Temp</p>
        </div>
        <div>
          <p className="font-display text-2xl text-cream tnum">{Math.round(c.windKph ?? 0)}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-cream/60">
            km/h {compass(c.windDirection)}
          </p>
        </div>
        <div>
          <p className="font-display text-2xl text-cream tnum">
            {c.rainChance != null ? `${c.rainChance}%` : "—"}
          </p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-cream/60">Rain</p>
        </div>
      </div>

      {!compact ? (
        <p className="mt-3 text-[11px] leading-relaxed text-cream/60">
          {c.description}
          {observed
            ? ` · observed ${observed.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })} ${observed.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
          . Wind decides Adare — a 20km/h crosswind turns the foursomes into a lottery.
        </p>
      ) : null}

      <p className="mt-2 text-[10px] text-cream/60">
        Open-Meteo · CC BY 4.0 · refreshed{" "}
        {new Date(c.fetchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      </p>
    </div>
  );
}
