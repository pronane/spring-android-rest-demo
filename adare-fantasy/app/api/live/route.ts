import { NextResponse } from "next/server";
import { parseFeed } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * Real match states when LIVE_FEED_URL is configured; otherwise tells the page
 * to keep running the simulation. LIVE_FEED_TOKEN, if set, is sent as a bearer
 * token. Responses are cached for 20 seconds so a busy Sunday doesn't hammer
 * the provider.
 */
export async function GET() {
  const url = process.env.LIVE_FEED_URL;
  if (!url) return NextResponse.json({ source: "simulation" });

  try {
    const res = await fetch(url, {
      headers: process.env.LIVE_FEED_TOKEN
        ? { authorization: `Bearer ${process.env.LIVE_FEED_TOKEN}` }
        : undefined,
      next: { revalidate: 20 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    const feed = parseFeed(await res.json());
    if (!feed) throw new Error("feed JSON did not match the expected shape");
    return NextResponse.json({ source: "feed", feed });
  } catch (err) {
    console.error("[live feed]", err);
    // Fall back to the simulation rather than showing an empty page.
    return NextResponse.json({ source: "simulation", error: "Live feed unavailable" });
  }
}
