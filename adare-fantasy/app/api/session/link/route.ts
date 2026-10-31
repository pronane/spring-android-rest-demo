import { NextResponse } from "next/server";
import { createLoginToken } from "@/lib/server/db";
import { appUrl, sendEmail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";

/**
 * Emails a one-time sign-in link. The reply is the same whether or not the
 * email has an account, so this can't be used to find out who has entered.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter the email you entered with." }, { status: 400 });
  }

  const created = await createLoginToken(email);
  let devLink: string | undefined;
  if (created) {
    const link = `${appUrl(request)}/api/session/verify?token=${encodeURIComponent(created.token)}`;
    const sent = await sendEmail({
      to: created.user.email,
      subject: "Your Twenty-Eight sign-in link",
      text: `Hi ${created.user.manager},\n\nTap to sign in on this device (valid for 15 minutes, works once):\n${link}\n\nIf you didn't ask for this, ignore it.`,
    });
    // Without a mail provider in development, hand the link back so the flow is testable.
    if (!sent && process.env.NODE_ENV !== "production") devLink = link;
  }

  return NextResponse.json({
    ok: true,
    message: "If that email has an entry, a sign-in link is on its way.",
    ...(devLink ? { devLink } : {}),
  });
}
