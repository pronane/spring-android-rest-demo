/**
 * Minimal email sender. Uses Resend's HTTP API when RESEND_API_KEY is set;
 * otherwise logs the message so local dev still works without an account.
 */
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Twenty-Eight <hello@twenty-eight.golf>";
  if (!key) {
    console.info(`[mail:dev] to=${input.to} subject="${input.subject}"\n${input.text}`);
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
