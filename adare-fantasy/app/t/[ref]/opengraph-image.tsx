import { ImageResponse } from "next/og";
import { findUserByEntryRef } from "@/lib/server/db";
import { getBreakdown, getStandings } from "@/lib/server/standings";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Twenty-Eight fantasy card";

/**
 * The picture that appears when a card is shared. Rendered on demand from the
 * same snapshot, so a WhatsApp preview is never stale.
 */
export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const user = await findUserByEntryRef(ref);
  const breakdown = user ? await getBreakdown(user.id) : null;
  const standings = user ? await getStandings({ limit: 500 }) : null;
  const row = standings?.rows.find((r) => r.entryId === user?.id);

  const team = user?.teamName ?? "Twenty-Eight";
  const manager = user?.manager ?? "Fantasy Ryder Cup";
  const points = breakdown?.score.total.toFixed(1) ?? "—";
  const rank = row ? `#${row.rank} of ${standings?.total ?? 0}` : "Unranked";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(160deg, #0d2b23 0%, #04100c 62%, #04100c 100%)",
          color: "#f5f1e6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 22, letterSpacing: 6, color: "#c8a95f" }}>TWENTY-EIGHT</div>
            <div style={{ fontSize: 18, color: "rgba(245,241,230,0.55)", marginTop: 4 }}>
              Fantasy Ryder Cup · Adare 2027
            </div>
          </div>
          <div style={{ fontSize: 20, color: "rgba(245,241,230,0.6)" }}>{rank}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>{team}</div>
          <div style={{ fontSize: 26, color: "rgba(245,241,230,0.65)", marginTop: 10 }}>{manager}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
            <div style={{ fontSize: 150, fontWeight: 700, color: "#e2c47e", lineHeight: 1 }}>{points}</div>
            <div style={{ fontSize: 30, color: "rgba(245,241,230,0.6)", paddingBottom: 22 }}>points</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ fontSize: 20, color: "rgba(245,241,230,0.6)" }}>
              {breakdown ? `${breakdown.results.finals} of ${breakdown.results.total} matches in` : ""}
            </div>
            <div style={{ fontSize: 20, color: "rgba(245,241,230,0.45)" }}>
              {breakdown ? `Cup ${breakdown.results.cup.europe}–${breakdown.results.cup.usa}` : ""}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
