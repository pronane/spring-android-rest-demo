/**
 * Server-side access to the live feed.
 *
 * `/api/live` used to be the only consumer, which meant the browser owned the
 * scoring loop. Now the feed is read here and used by the results snapshot too,
 * so the table, the private leagues, the share cards and the API all score the
 * same matches. The 20-second cache keeps a busy Sunday from hammering a free
 * provider (the feed is expected to be a free source — no key required, an
 * optional bearer token for the ones that want one).
 */
import { parseFeed, type LiveFeed } from "@/lib/live";

export type FeedRead = {
  feed: LiveFeed | null;
  error: string | null;
};

export function feedConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.LIVE_FEED_URL);
}

export async function readLiveFeed(
  env: Record<string, string | undefined> = process.env,
): Promise<FeedRead> {
  const url = env.LIVE_FEED_URL;
  if (!url) return { feed: null, error: null };

  try {
    const res = await fetch(url, {
      headers: env.LIVE_FEED_TOKEN ? { authorization: `Bearer ${env.LIVE_FEED_TOKEN}` } : undefined,
      next: { revalidate: 20 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    const feed = parseFeed(await res.json());
    if (!feed) throw new Error("feed JSON did not match the expected shape");
    return { feed, error: null };
  } catch (err) {
    console.error("[live feed]", err);
    return { feed: null, error: err instanceof Error ? err.message : "Feed unavailable" };
  }
}
