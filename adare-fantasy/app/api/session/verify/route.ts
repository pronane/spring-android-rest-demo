import { NextResponse } from "next/server";
import { COOKIE, makeToken } from "@/lib/server/auth";
import { consumeLoginToken } from "@/lib/server/db";
import { appUrl } from "@/lib/server/mail";

export const dynamic = "force-dynamic";

/** Landing point for the emailed link: spends the token and signs this browser in. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const base = appUrl(request);
  const userId = token ? await consumeLoginToken(token) : null;
  if (!userId) return NextResponse.redirect(`${base}/account?signin=expired`, 303);

  const response = NextResponse.redirect(`${base}/account?signin=ok`, 303);
  response.cookies.set(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 120,
  });
  return response;
}
