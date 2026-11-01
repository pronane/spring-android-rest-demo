import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Minimal email sender.
 *
 *  - `MAIL_OUTBOX=/some/dir` writes every message there as JSON instead of
 *    sending it — a local inbox, so you can run the sign-in flow on a production
 *    build without a mail provider. The end-to-end test uses this.
 *  - `RESEND_API_KEY` sends for real.
 *  - Neither: development logs the message; a production build does not, because
 *    it contains a live sign-in token and a token in a log is a token an operator
 *    can use.
 */
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Twenty-Eight <hello@twenty-eight.golf>";

  const outbox = process.env.MAIL_OUTBOX;
  if (outbox) {
    const dir = path.resolve(outbox);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.json`);
    await fs.writeFile(
      file,
      JSON.stringify({ to: input.to, from, subject: input.subject, text: input.text, at: new Date().toISOString() }, null, 2),
      "utf8",
    );
    return true;
  }

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
