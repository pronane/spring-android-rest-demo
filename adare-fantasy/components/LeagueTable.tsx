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
    <div className="overflow-hidden rounded-2xl border border-line">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-surface-2 text-[9.5px] uppercase tracking-[0.16em] text-ink-soft">
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
                className={`border-t border-line text-[13px] ${
                  isYou ? "bg-accent/[0.08]" : "hover:bg-surface"
                }`}
              >
                <td className="py-3 pl-4">
                  <span
                    className={`tnum inline-grid h-6 w-6 place-items-center rounded-full border text-[11px] ${
                      index === 0
                        ? "border-accent/60 bg-accent/15 text-accent"
                        : index === 1 || index === 2
                          ? "border-ink/15 text-ink-soft"
                          : "border-transparent text-ink-soft"
                    }`}
                  >
                    {index + 1}
                  </span>
                </td>
                <td className="py-3 pr-3">
                  <span className="flex items-center gap-2">
                    <span className={`truncate font-medium ${isYou ? "text-ink" : "text-ink/85"}`}>
                      {row.team}
                    </span>
                    {isYou ? (
                      <span className="rounded bg-butter px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink">
                        You
                      </span>
                    ) : null}
                  </span>
                  {dense ? (
                    <span className="text-[11px] text-ink-soft">{row.manager}</span>
                  ) : null}
                </td>
                {!dense && (
                  <td className="hidden py-3 pr-3 text-[12px] text-ink-soft sm:table-cell">
                    {row.manager}
                  </td>
                )}
                <td className="py-3 pr-4 text-right tnum font-semibold text-ink">
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
