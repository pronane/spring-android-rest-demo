import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE = "te_session";
const SECRET = process.env.SESSION_SECRET ?? "twenty-eight-dev-secret";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 32);
}

export function makeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function parseToken(token: string | undefined): string | null {
  if (!token) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  try {
    if (
      expected.length === sig.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return id;
    }
  } catch {
    return null;
  }
  return null;
}

export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  return parseToken(store.get(COOKIE)?.value);
}
