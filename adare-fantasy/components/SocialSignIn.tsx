"use client";

import { useEffect, useState } from "react";

type Provider = { id: string; name: string; label: string };

/**
 * The social sign-in row.
 *
 * It only draws what the server says it can offer (`/api/auth/providers`), so a
 * deployment without credentials shows nothing rather than a button that fails.
 * Each button is a plain link to `/api/auth/<provider>/start`, which is a
 * redirect — there is no client-side token handling anywhere in the flow.
 */
export function SocialSignIn({
  next = "/account",
  note,
}: {
  next?: string;
  note?: string;
}) {
  const [providers, setProviders] = useState<Provider[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/providers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { providers: [] }))
      .then((data: { providers?: Provider[] }) => {
        if (!cancelled) setProviders(data.providers ?? []);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!providers || providers.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <a
            key={provider.id}
            href={`/api/auth/${provider.id}/start?next=${encodeURIComponent(next)}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-[12.5px] font-medium text-cream/85 transition hover:border-gold/50 hover:text-gold-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/60"
          >
            Continue with {provider.label}
          </a>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-cream/45">
        {note ??
          "Social sign-in uses the email your provider has verified, and joins the entry you already have on that address."}
      </p>
    </div>
  );
}
