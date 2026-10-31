"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { useFantasy } from "@/lib/store";
import { eur } from "@/lib/helpers";
import { ACTIVE_EDITION, PLANS, PRIZE_SPLIT, SPONSORS } from "@/lib/tournaments";

const EXAMPLE_ENTRIES = 5000;

export default function EnterPage() {
  const { state, ready, setEntry, paid, setIdentity } = useFantasy();
  const [planId, setPlanId] = useState<string>("single");
  const [email, setEmail] = useState("");
  const [manager, setManager] = useState("");
  const [teamName, setTeamName] = useState("");
  const seeded = useRef(false);
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The store renders the demo team on the server, so identity has to be
  // adopted once the real (localStorage) state is ready — otherwise the fields
  // keep the demo name and whatever the manager types is appended to it.
  useEffect(() => {
    if (!ready || seeded.current) return;
    seeded.current = true;
    setManager(state.manager);
    setTeamName(state.teamName);
  }, [ready, state.manager, state.teamName]);
  const receipt = paid && state.entry.ref
    ? { ref: state.entry.ref, amount: state.entry.amount, plan: state.entry.plan ?? "single" }
    : null;

  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0];
  const pool = EXAMPLE_ENTRIES * 10;

  const pay = async () => {
    setError(null);
    if (!email.includes("@")) {
      setError("We need an email for the entry receipt.");
      return;
    }
    if (card.number.replace(/\s/g, "").length < 12) {
      setError("Enter any 12+ digits in the demo card field — nothing is charged.");
      return;
    }
    setBusy(true);
    try {
      const sessionRes = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, manager, teamName }),
      });
      if (!sessionRes.ok) throw new Error("Could not create the account.");
      setIdentity(manager, teamName);

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = (await res.json()) as {
        error?: string;
        entry?: { ref: string; amount: number; plan: string; paidAt: string };
      };
      if (!res.ok || !data.entry) throw new Error(data.error ?? "Payment failed.");

      setEntry({
        paid: true,
        plan: data.entry.plan,
        ref: data.entry.ref,
        amount: data.entry.amount,
        paidAt: data.entry.paidAt,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="max-w-2xl">
        <Eyebrow>Entry · {ACTIVE_EDITION.name}</Eyebrow>
        <h1 className="mt-2 text-4xl text-cream sm:text-5xl">
          One payment. Both games. All three days.
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-cream/70">
          Entry funds the prize pool. Your card and your match predictions are included — there is
          no upsell, no premium armband and no second charge at the first tee.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          {/* plans */}
          <div className="grid gap-3 sm:grid-cols-3">
            {PLANS.map((option) => {
              const active = option.id === planId;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPlanId(option.id)}
                  aria-pressed={active}
                  className={`relative rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-gold/60 bg-gold/[0.07]"
                      : "border-white/10 bg-white/[0.025] hover:border-white/25"
                  }`}
                >
                  {option.highlight ? (
                    <span className="absolute right-3 top-3 rounded-full bg-gold px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-forest-950">
                      Popular
                    </span>
                  ) : null}
                  <p className="text-[13px] font-medium text-cream">{option.name}</p>
                  <p className="mt-1 font-display text-2xl text-cream tnum">
                    {eur(option.price)}
                  </p>
                  <p className="text-[10.5px] text-cream/60">
                    {option.entries} {option.entries === 1 ? "entry" : "entries"}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {option.features.map((f) => (
                      <li key={f} className="flex gap-1.5 text-[10.5px] leading-relaxed text-cream/70">
                        <span className="text-shamrock">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* checkout */}
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            {receipt ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-shamrock/15 text-shamrock">
                    ✓
                  </span>
                  <div>
                    <p className="text-[14px] font-medium text-cream">You are in.</p>
                    <p className="text-[11.5px] text-cream/70">
                      Entry {receipt.ref} · {eur(receipt.amount)} paid
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
                <p className="mt-3 text-[10.5px] text-cream/60">
                  Demo checkout — no card was charged and no card data is stored.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="eyebrow text-cream/60">Checkout</p>
                  <span className="text-[11px] text-cream/60 tnum">
                    {plan.name} · {eur(plan.price)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                  />
                  <Field
                    label="Manager name"
                    value={manager}
                    onChange={setManager}
                    placeholder="Séamus Ryan"
                    autoComplete="name"
                  />
                  <Field
                    label="Team name"
                    value={teamName}
                    onChange={setTeamName}
                    placeholder="Bogey Merchants"
                    autoComplete="organization"
                    className="sm:col-span-2"
                  />
                  <Field
                    label="Card number"
                    value={card.number}
                    onChange={(v) => setCard({ ...card, number: v })}
                    placeholder="4242 4242 4242 4242"
                    autoComplete="cc-number"
                    inputMode="numeric"
                    maxLength={19}
                    className="sm:col-span-2"
                  />
                  <Field
                    label="Expiry"
                    value={card.expiry}
                    onChange={(v) => setCard({ ...card, expiry: v })}
                    placeholder="09 / 27"
                    autoComplete="cc-exp"
                    inputMode="numeric"
                    maxLength={7}
                  />
                  <Field
                    label="CVC"
                    value={card.cvc}
                    onChange={(v) => setCard({ ...card, cvc: v })}
                    placeholder="123"
                    autoComplete="cc-csc"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>

                {error ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg border border-usa/30 bg-usa/10 px-3 py-2 text-[11.5px] text-usa"
                  >
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={pay}
                  disabled={busy}
                  aria-busy={busy}
                  className={`mt-4 w-full rounded-full py-3 text-[13px] font-semibold transition ${
                    busy
                      ? "cursor-wait bg-white/10 text-cream/60"
                      : "bg-gold text-forest-950 hover:bg-gold-soft"
                  }`}
                >
                  {busy ? "Processing…" : `Pay ${eur(plan.price)} & enter`}
                </button>
                <p className="mt-2 text-center text-[10.5px] text-cream/60">
                  Demo checkout · no card is charged · entries are refundable until the field is
                  confirmed
                </p>
              </>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {SPONSORS.map((sponsor) => (
              <div
                key={sponsor.name}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
              >
                <p className="text-[9px] uppercase tracking-[0.14em] text-gold/85">{sponsor.tier}</p>
                <p className="mt-1 text-[12.5px] font-medium text-cream/85">{sponsor.name}</p>
                <p className="text-[10.5px] text-cream/60">{sponsor.tag}</p>
              </div>
            ))}
          </div>
        </div>

        {/* prize pool */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-5">
            <p className="eyebrow text-cream/60">Prize pool</p>
            <p className="mt-1 font-display text-3xl text-gold-soft tnum">{eur(pool)}</p>
            <p className="text-[11px] text-cream/60">
              at {EXAMPLE_ENTRIES.toLocaleString("en-IE")} entries · 95% paid out
            </p>
            <ul className="mt-4 space-y-2">
              {PRIZE_SPLIT.map((row) => (
                <li key={row.label} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-28 shrink-0 text-cream/70">{row.label}</span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-gold/70"
                      style={{ width: `${(row.share / 0.35) * 100}%` }}
                    />
                  </span>
                  <span className="w-14 text-right tnum text-cream/80">
                    {eur(pool * row.share)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10.5px] leading-relaxed text-cream/60">
              Prize pool is illustrative and scales with entries. Private leagues can add their own
              buy-in and sponsor pot on top.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="eyebrow text-cream/60">What the entry covers</p>
            <ul className="mt-3 space-y-2 text-[12px] text-cream/70">
              {[
                "Classic Six and Captain's Dozen cards",
                "The 28-match predictor + awards",
                "Live scoring and private leagues",
                "Prize-pool eligibility",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-shamrock">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="eyebrow text-cream/60">League sponsor slots</p>
            <p className="mt-2 text-[12px] leading-relaxed text-cream/70">
              Commissioners can attach a sponsor to a private league — a bar, a club, a WhatsApp
              group with delusions of grandeur. Sponsor funds sit on top of the main prize pool.
            </p>
            <Link
              href="/leagues"
              className="mt-3 inline-block text-[11.5px] text-gold-soft/80 hover:text-gold"
            >
              Set up a league →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: "text" | "email";
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "email";
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-cream/60">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-white/12 bg-forest-950/60 px-3 py-2 text-[13px] text-cream placeholder:text-cream/60 focus:border-gold/50 focus:outline-none"
      />
    </label>
  );
}
