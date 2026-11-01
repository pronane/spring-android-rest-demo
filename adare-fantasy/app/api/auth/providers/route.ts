import { NextResponse } from "next/server";
import { configuredProviders } from "@/lib/server/oauth";

export const dynamic = "force-dynamic";

/**
 * Which social sign-ins this deployment offers. The buttons are built from
 * this, so adding credentials is the only thing needed to turn one on.
 */
export async function GET() {
  const providers = configuredProviders().map((settings) => ({
    id: settings.provider.id,
    name: settings.provider.name,
    label: settings.provider.label,
  }));
  return NextResponse.json({ providers }, { headers: { "cache-control": "no-store" } });
}
