"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { eur } from "@/lib/helpers";
import { useFantasy } from "@/lib/store";

type Order = {
  ref: string;
  status: "pending" | "paid" | "failed" | "refunded";
  planId: string;
  planName: string;
  amountCents: number;
  amountLabel: string;
  provider: "demo" | "stripe";
  createdAt: string;
  paidAt: string | null;
  note: string | null;
};

type Entry = { ref: string; plan: string; amount: number; paidAt: string };

type OrderResponse = { order?: Order; entry?: Entry | null; error?: string };

export default function PayPage() {
  const params = useParams<{ ref: string }>();
  const search = useSearchParams();
  const returning = search.get("return") === "1";
  const ref = params?.ref ?? "";
  const { setEntry: applyEntry } = useFantasy();

  const [order, setOrder] = useState<Order | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ref) return;
    try {
      const res = await fetch(`/api/orders/${ref}`, { cache: "no-store" });
      const data = (await res.json()) as OrderResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not load that order.");
      setOrder(data.order ?? null);
      setEntry(data.entry ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that order.");
    } finally {
      setLoading(false);
    }
  }, [ref]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stripe settles out of band, so a returning visitor waits for the webhook.
  useEffect(() => {
    if (!order || order.status !== "pending" || order.provider !== "stripe") return;
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [order, load]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${ref}/confirm`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; entry?: Entry };
      if (!res.ok) throw new Error(data.error ?? "Payment failed.");
      if (data.entry) {
        applyEntry({
          paid: true,
          plan: data.entry.plan,
          ref: data.entry.ref,
          amount: data.entry.amount,
          paidAt: data.entry.paidAt,
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10">
      <Eyebrow>Checkout</Eyebrow>
      <h1 className="mt-2 text-4xl text-cream sm:text-5xl">
        {order?.status === "paid" ? "You are in." : "One payment. Then the games."}
      </h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-cream/70">
        Your entry is created the moment the payment settles — nothing is reserved before that, and
        nothing is charged twice if you refresh.
      </p>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
        {loading ? (
          <p className="text-[13px] text-cream/60">Loading your order…</p>
        ) : error && !order ? (
          <div>
            <p className="text-[14px] text-usa">{error}</p>
            <Link href="/enter" className="mt-3 inline-block text-[12.5px] text-gold hover:underline">
              Back to entry
            </Link>
          </div>
        ) : order ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
              <div>
                <p className="eyebrow text-cream/60">{order.planName}</p>
                <p className="mt-1 text-[13px] text-cream/70">
                  Order {order.ref} · {new Date(order.createdAt).toLocaleString("en-IE")}
                </p>
              </div>
              <p className="text-2xl text-cream tnum">{order.amountLabel}</p>
            </div>

            {order.status === "paid" && entry ? (
              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-shamrock/15 text-shamrock">
                    ✓
                  </span>
                  <div>
                    <p className="text-[14px] font-medium text-cream">Entry {entry.ref} · paid</p>
                    <p className="text-[11.5px] text-cream/70">
                      {order.provider === "stripe" ? "Card payment" : "Demo payment"} ·{" "}
                      {order.paidAt ? new Date(order.paidAt).toLocaleTimeString("en-IE") : "just now"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Link
                    href="/draft"
                    className="rounded-full bg-gold py-2.5 text-center text-[12.5px] font-semibold text-forest-950 transition hover:bg-gold-soft"
                  >
                    Draft my card
                  </Link>
                  <Link
                    href="/predict"
                    className="rounded-full border border-cream/25 py-2.5 text-center text-[12.5px] font-medium text-cream transition hover:border-gold/60"
                  >
                    Call the 28
                  </Link>
                  <Link
                    href="/account"
                    className="rounded-full border border-white/12 py-2.5 text-center text-[12.5px] text-cream/60 transition hover:text-cream"
                  >
                    View receipt
                  </Link>
                </div>
              </div>
            ) : order.status === "pending" && order.provider === "demo" ? (
              <div className="mt-5">
                <p className="text-[13px] leading-relaxed text-cream/75">
                  This build has no Stripe keys, so the payment provider is a button. Pressing it
                  runs the same settlement a real webhook would: the order is marked paid, the entry
                  is created and three ledger rows are written. No card is charged.
                </p>
                <button
                  type="button"
                  onClick={pay}
                  disabled={busy}
                  className="mt-4 w-full rounded-full bg-gold py-3 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft disabled:opacity-60 sm:w-auto sm:px-6"
                >
                  {busy ? "Settling…" : `Pay ${eur(order.amountCents / 100)} · demo card`}
                </button>
                <p className="mt-3 text-[10.5px] text-cream/55">
                  Demo checkout — no card data is stored, and entries stay refundable until the field
                  is confirmed.
                </p>
              </div>
            ) : order.status === "pending" ? (
              <div className="mt-5">
                <p className="text-[13px] leading-relaxed text-cream/75">
                  Waiting for Stripe to confirm the payment. This page updates itself — you can close
                  it and come back to this link.
                </p>
                <p className="mt-3 text-[11px] text-cream/55">
                  {returning
                    ? "Back from Stripe — checking the webhook."
                    : "If nothing happens in a minute, the webhook may not be configured."}
                </p>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-[13px] text-usa">
                  {order.status === "failed"
                    ? "That payment did not go through. Nothing has been charged."
                    : "This order was refunded, so the entry is no longer prize-eligible."}
                </p>
                <Link href="/enter" className="mt-3 inline-block text-[12.5px] text-gold hover:underline">
                  Try again
                </Link>
              </div>
            )}

            {error ? (
              <p className="mt-4 rounded-lg border border-usa/30 bg-usa/10 px-3 py-2 text-[11.5px] text-usa">
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
