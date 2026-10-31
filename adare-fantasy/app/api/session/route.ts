import { NextResponse } from "next/server";
import { COOKIE, currentUserId, makeToken } from "@/lib/server/auth";
import { findUser, upsertUser } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const id = await currentUserId();
  const user = id ? await findUser(id) : null;
  return NextResponse.json({ signedIn: Boolean(user), user });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    manager?: string;
    teamName?: string;
  };
  const email = (body.email ?? "").trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  const user = await upsertUser({
    email,
    manager: (body.manager ?? "").trim() || email.split("@")[0],
    teamName: (body.teamName ?? "").trim() || "My card",
  });
  const response = NextResponse.json({ signedIn: true, user });
  response.cookies.set(COOKIE, makeToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 120,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ signedIn: false });
  response.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
