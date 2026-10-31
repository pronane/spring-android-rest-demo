import { NextResponse } from "next/server";
import { readLiveFeed } from "@/lib/server/feed";

export const dynamic = "force-dynamic";

/**
 * Real match states when LIVE_FEED_URL is configured; otherwise tells the page
 * to keep running the simulation. LIVE_FEED_TOKEN, if set, is sent as a bearer
 * token. Responses are cached for 20 seconds so a busy Sunday doesn't hammer
 * the provider.
 */
export async function GET() {
  const read = await readLiveFeed();
  if (read.feed) return NextResponse.json({ source: "feed", feed: read.feed });
  if (!read.error) return NextResponse.json({ source: "simulation" });
  // Fall back to the simulation rather than showing an empty page.
  return NextResponse.json({ source: "simulation", error: "Live feed unavailable" });
}
