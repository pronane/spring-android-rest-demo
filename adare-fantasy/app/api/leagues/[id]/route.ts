import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { leaveLeague } from "@/lib/server/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const me = await currentUserId();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await leaveLeague(me, id);
  if (!ok) return NextResponse.json({ error: "You're not in that league." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
