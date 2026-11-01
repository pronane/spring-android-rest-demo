/**
 * One thing worth saying out loud at boot.
 *
 * A hosted deployment with no database falls back to the JSON file, and a
 * serverless filesystem is thrown away between requests — so entries vanish and
 * the site looks broken rather than misconfigured. The same is true of a SQLite
 * *file* on such a host; a Turso URL is not, because it lives somewhere else.
 *
 * `/api/health` reports the same thing; this makes it visible in the host's logs
 * too, at the moment the container starts rather than the first time a visitor
 * loses their card.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const { backend, storedOnDisk } = await import("@/lib/server/db");
  const hosted = Boolean(process.env.VERCEL || process.env.RENDER || process.env.FLY_APP_NAME || process.env.NETLIFY);

  if (storedOnDisk() && hosted) {
    console.warn(
      `[twenty-eight] Store is "${backend()}", which lives on this machine's filesystem — and this host throws that away. ` +
        "Set DATABASE_URL (Postgres) or LIBSQL_URL (Turso) and run `npm run db:migrate`. See DEPLOY.md.",
    );
  }
  if (!process.env.SESSION_SECRET) {
    console.error("[twenty-eight] No SESSION_SECRET: sign-in and checkout will fail with a 500.");
  }
}
