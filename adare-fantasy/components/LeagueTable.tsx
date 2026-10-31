import type { LeagueMember } from "@/lib/data";

export function LeagueTable({
  members,
  you,
  limit,
  dense = false,
}: {
  members: LeagueMember[];
  you?: string;
  limit?: number;
  dense?: boolean;
}) {
  const rows = limit ? members.slice(0, limit) : members;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-white/[0.04] text-[9.5px] uppercase tracking-[0.16em] text-cream/40">
            <th className="w-10 py-2.5 pl-4 font-semibold">#</th>
            <th className="py-2.5 font-semibold">Team</th>
            {!dense && <th className="hidden py-2.5 font-semibold sm:table-cell">Manager</th>}
            <th className="py-2.5 pr-4 text-right font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isYou = row.isYou || (you && row.team === you);
            return (
              <tr
                key={`${row.team}-${index}`}
                className={`border-t border-white/[0.06] text-[13px] ${
                  isYou ? "bg-gold/[0.08]" : "hover:bg-white/[0.02]"
                }`}
              >
                <td className="py-3 pl-4">
                  <span
                    className={`tnum inline-grid h-6 w-6 place-items-center rounded-full border text-[11px] ${
                      index === 0
                        ? "border-gold/60 bg-gold/15 text-gold-soft"
                        : index === 1 || index === 2
                          ? "border-white/15 text-cream/70"
                          : "border-transparent text-cream/35"
                    }`}
                  >
                    {index + 1}
                  </span>
                </td>
                <td className="py-3 pr-3">
                  <span className="flex items-center gap-2">
                    <span className={`truncate font-medium ${isYou ? "text-cream" : "text-cream/85"}`}>
                      {row.team}
                    </span>
                    {isYou ? (
                      <span className="rounded bg-gold px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-[0.1em] text-forest-950">
                        You
                      </span>
                    ) : null}
                  </span>
                  {dense ? (
                    <span className="text-[11px] text-cream/35">{row.manager}</span>
                  ) : null}
                </td>
                {!dense && (
                  <td className="hidden py-3 pr-3 text-[12px] text-cream/45 sm:table-cell">
                    {row.manager}
                  </td>
                )}
                <td className="py-3 pr-4 text-right tnum font-semibold text-cream">
                  {row.points.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
