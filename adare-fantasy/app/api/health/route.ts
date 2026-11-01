import { NextResponse } from "next/server";

import { backend } from "@/lib/server/db";
import { ping as pingPostgres, usingPostgres } from "@/lib/server/store-pg";
import { ping as pingSqlite, usingSqlite } from "@/lib/server/store-sqlite";

export const dynamic = "force-dynamic";

/**
 * What this deployment is actually running on.
 *
 *   GET /api/health
 *   { ok: true, store: "postgres", storeDetail: "8/8 tables", ephemeral: false, commit: "…", url: "…" }
 *
 * `store` is one of `postgres`, `turso` (hosted libSQL), `sqlite` (a file on this
 * machine) or `json` (the file store used when nothing is configured).
 *
 * `ephemeral` is the one to watch on a hosted demo: a serverless filesystem is
 * thrown away between requests, so a deployment with no database — or with a
 * SQLite *file* — looks fine and silently loses every entry. See DEPLOY.md.
 */
export async function GET() {
  const store = backend();
  const check = usingPostgres()
    ? await pingPostgres()
    : usingSqlite()
      ? await pingSqlite()
      : { ok: true, detail: "json file" };
  // `turso` is remote, so it is never ephemeral; a sqlite file or the JSON store is.
  const hosted = Boolean(process.env.VERCEL || process.env.RENDER || process.env.FLY_APP_NAME || process.env.NETLIFY);
  const onDisk = store === "json" || store === "sqlite";
  const ephemeral = onDisk && hosted;

  return NextResponse.json(
    {
      ok: check.ok && !ephemeral,
      store,
      storeDetail: check.detail,
      ephemeral,
      ...(ephemeral
        ? {
            warning:
              store === "sqlite"
                ? "This host has an ephemeral filesystem, so the SQLite file will not survive a deploy. Point LIBSQL_URL at a Turso database (libsql://…), or set DATABASE_URL to a Postgres database, then redeploy."
                : "This host has an ephemeral filesystem. Set DATABASE_URL (Postgres), or LIBSQL_URL (Turso), apply the schema with `npm run db:migrate`, then redeploy.",
          }
        : {}),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_COMMIT?.slice(0, 7) ?? null,
      appUrl: process.env.APP_URL ?? null,
      payments: process.env.PAYMENTS_PROVIDER ?? (process.env.STRIPE_SECRET_KEY ? "stripe" : "demo"),
      socialProviders: Boolean(process.env.GOOGLE_CLIENT_ID) || Boolean(process.env.APPLE_CLIENT_ID) || Boolean(process.env.FACEBOOK_APP_ID),
      at: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
