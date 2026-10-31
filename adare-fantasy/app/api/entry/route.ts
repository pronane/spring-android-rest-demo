import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/server/auth";
import { updateTeam } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    mode?: "classic" | "full";
    squad?: string[];
    captain?: string | null;
    predictions?: Record<string, string>;
  };
  const user = await updateTeam(userId, body);
  if (!user) {
    return NextResponse.json(
      { error: "No paid entry on this account yet." },
      { status: 402 },
    );
  }
  return NextResponse.json({ ok: true, user });
}
