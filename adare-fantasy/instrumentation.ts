/**
 * One thing worth saying out loud at boot.
 *
 * A hosted deployment without `DATABASE_URL` falls back to the JSON file, and a
 * serverless filesystem is thrown away between requests — so entries vanish and
 * the site looks broken rather than misconfigured. `/api/health` reports the same
 * thing; this makes it visible in the host's logs too.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const hosted = Boolean(process.env.VERCEL || process.env.RENDER || process.env.FLY_APP_NAME);
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    console.warn(
      `[twenty-eight] No DATABASE_URL: using the JSON file store${hosted ? " on a host with an ephemeral filesystem — entries will not survive a request" : ""}. ` +
        "Set DATABASE_URL and run `npm run db:migrate` — see DEPLOY.md.",
    );
  }
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.error("[twenty-eight] No SESSION_SECRET: sign-in and checkout will fail with a 500.");
  }
}
