import { NextResponse } from "next/server";
import { COOKIE, currentUserId, makeToken } from "@/lib/server/auth";
import { findUser, findUserByEmail, upsertUser } from "@/lib/server/db";

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
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // Typing someone else's email must not sign you in as them. Until there is a
  // real sign-in (magic link / password), an existing account can only be
  // updated from the browser that already holds its session.
  const existing = await findUserByEmail(email);
  const currentId = await currentUserId();
  if (existing && existing.id !== currentId) {
    return NextResponse.json(
      {
        error:
          "That email already has an entry. Sign in from the device you entered on, or contact support.",
      },
      { status: 409 },
    );
  }

  const user = await upsertUser({
    email,
    manager: (body.manager ?? "").trim().slice(0, 60) || email.split("@")[0],
    teamName: (body.teamName ?? "").trim().slice(0, 60) || "My card",
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
