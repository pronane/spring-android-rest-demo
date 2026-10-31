/**
 * Shared admin guard. `ADMIN_TOKEN` is a bearer token compared in constant time;
 * when it is missing or too short the endpoints are *disabled*, not open.
 */
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type AdminAuth = "ok" | "disabled" | "denied";

export function adminAuth(request: Request): AdminAuth {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret || secret.length < 16) return "disabled";
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!given) return "denied";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b) ? "ok" : "denied";
}

export function adminRefusal(state: Exclude<AdminAuth, "ok">) {
  if (state === "disabled") {
    return NextResponse.json(
      { error: "Admin tools are disabled — set ADMIN_TOKEN (16+ chars) to enable them." },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "Not authorised." }, { status: 401 });
}
