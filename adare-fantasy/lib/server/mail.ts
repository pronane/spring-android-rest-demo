/**
 * Minimal email sender. Uses Resend's HTTP API when RESEND_API_KEY is set.
 * Without a key, development logs the message so the flow is testable; in
 * production the message is *not* logged — it contains a live sign-in token, and
 * a token in the server log is a token an operator can use.
 */
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Twenty-Eight <hello@twenty-eight.golf>";
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.warn(`[mail] RESEND_API_KEY is not set — "${input.subject}" to ${input.to} was not sent`);
    } else {
      console.info(`[mail:dev] to=${input.to} subject="${input.subject}"\n${input.text}`);
    }
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
  });
  if (!res.ok) console.error("[mail] send failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}

/** Public base URL for links in emails. */
export function appUrl(request: Request): string {
  return (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}
