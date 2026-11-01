import { NextResponse } from "next/server";

import { backend } from "@/lib/server/db";
import { ping, usingPostgres } from "@/lib/server/store-pg";

export const dynamic = "force-dynamic";

/**
 * What this deployment is actually running on.
 *
 *   GET /api/health
 *   { ok: true, store: "postgres", storeDetail: "8/8 tables", ephemeral: false, commit: "…", url: "…" }
 *
 * `ephemeral` is the one to watch on a hosted demo: a serverless filesystem is
 * thrown away between requests, so a production deployment without
 * `DATABASE_URL` looks fine and silently loses every entry. See DEPLOY.md.
 */
export async function GET() {
  const store = backend();
  const check = usingPostgres() ? await ping() : { ok: true, detail: "json file" };
  const hosted = Boolean(process.env.VERCEL || process.env.RENDER || process.env.FLY_APP_NAME);
  const ephemeral = store === "json" && hosted;

  return NextResponse.json(
    {
      ok: check.ok && !ephemeral,
      store,
      storeDetail: check.detail,
      ephemeral,
      ...(ephemeral
        ? {
            warning:
              "This host has an ephemeral filesystem. Set DATABASE_URL (a free Neon or Supabase database works), apply db/schema.sql with `npm run db:migrate`, then redeploy.",
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
