import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { countReferrals, findUser, findUserByEntryRef, grantReferral } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * Your invite: the code is your entry ref, so the share link works without a
 * second identity system. Claiming one adds a free transfer to both cards.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await findUser(userId);
  const entry = user?.entry;
  if (!entry?.ref) return NextResponse.json({ error: "No entry yet." }, { status: 404 });
  return NextResponse.json(
    {
      code: entry.ref,
      link: `/enter?ref=${encodeURIComponent(entry.ref)}`,
      invited: await countReferrals(entry.ref),
      bonusTransfers: entry.bonusTransfers ?? 0,
      referredBy: entry.referredBy ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Claims an invite for the signed-in player. Idempotent per card. */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";
  if (!(await findUserByEntryRef(code))) {
    return NextResponse.json({ error: "That invite code does not exist." }, { status: 404 });
  }
  const result = await grantReferral(userId, code);
  if (!result.credited) {
    return NextResponse.json(
      { error: "That invite has already been claimed, or there is no paid entry to credit yet.", credited: false },
      { status: 409 },
    );
  }
  return NextResponse.json({ credited: true, bonusTransfers: result.invitee?.entry?.bonusTransfers ?? 1 });
}
