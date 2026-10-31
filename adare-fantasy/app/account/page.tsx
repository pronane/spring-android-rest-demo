"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { useFantasy } from "@/lib/store";
import { eur } from "@/lib/helpers";
import type { User } from "@/lib/server/db";

export default function AccountPage() {
  const { state, projected, mode } = useFantasy();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data: { signedIn: boolean; user: User | null }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setUser(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-10">
      <Eyebrow>Account</Eyebrow>
      <h1 className="mt-2 text-4xl text-cream sm:text-5xl">Your entry</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-cream/70">
        Accounts are cookie-based and stored server-side by the demo API. In production this becomes
        an email magic-link login backed by Postgres.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-cream/60">Signed in as</p>
          {loading ? (
            <p className="mt-2 text-[13px] text-cream/60">Loading…</p>
          ) : user ? (
            <>
              <p className="mt-2 text-[15px] text-cream">{user.manager}</p>
              <p className="text-[12.5px] text-cream/70">{user.email}</p>
              <p className="mt-3 text-[11px] text-cream/60">
                Account created {new Date(user.createdAt).toLocaleDateString("en-IE")}
              </p>
              <button
                type="button"
                onClick={signOut}
                className="mt-4 rounded-full border border-white/15 px-4 py-1.5 text-[11.5px] text-cream/70 transition hover:border-usa/40 hover:text-usa"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] text-cream/70">
                No server session yet. Entering the game creates one.
              </p>
              <Link
                href="/enter"
                className="mt-4 inline-flex rounded-full bg-gold px-4 py-2 text-[12px] font-semibold text-forest-950"
              >
                Enter the cup
              </Link>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <p className="eyebrow text-cream/60">Entry receipt</p>
          {user?.entry ? (
            <>
              <p className="mt-2 font-display text-2xl text-gold-soft">{user.entry.ref}</p>
              <dl className="mt-3 space-y-1.5 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-cream/70">Plan</dt>
                  <dd className="text-cream/85">{user.entry.plan}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cream/70">Paid</dt>
                  <dd className="text-cream/85">{eur(user.entry.amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cream/70">Edition</dt>
                  <dd className="text-cream/85">{user.entry.editionId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cream/70">Card saved</dt>
                  <dd className="text-cream/85">{user.entry.squad?.length ?? 0} players</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] text-cream/70">
                {state.entry.paid
                  ? `Local demo entry ${state.entry.ref} — no server receipt.`
                  : "No entry on this browser yet."}
              </p>
              {!state.entry.paid ? (
                <Link
                  href="/enter"
                  className="mt-4 inline-flex rounded-full border border-white/20 px-4 py-2 text-[12px] text-cream/75"
                >
                  See entry options
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-cream/60">Your card</p>
            <p className="mt-1 text-[15px] text-cream">
              {state.teamName || "Untitled"} · {mode.name}
            </p>
            <p className="text-[12px] text-cream/70">
              {state.squad.length}/{mode.squadSize} players · {projected.toFixed(1)} projected pts ·
              captain {state.captain ? "set" : "not set"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/team"
              className="rounded-full bg-cream px-4 py-2 text-[12px] font-semibold text-forest-900"
            >
              Open my team
            </Link>
            <Link
              href="/predict"
              className="rounded-full border border-white/20 px-4 py-2 text-[12px] text-cream/75"
            >
              My predictions
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[10.5px] leading-relaxed text-cream/60">
        Demo only: sessions are signed cookies, entries live in a JSON file on the server, and no
        payment data is stored or transmitted. Production swaps this for magic-link auth, Postgres
        and a real PSP (Stripe) with server-side webhooks.
      </p>
    </div>
  );
}
