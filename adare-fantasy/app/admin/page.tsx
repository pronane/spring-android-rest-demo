"use client";

import { useCallback, useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui";

/**
 * Operator console. It is a normal page, not a separate app: paste the
 * `ADMIN_TOKEN` and it talks to the same admin API the tests use. The token stays
 * in sessionStorage — it is never baked into the bundle.
 */

type Tab = "results" | "payments" | "prizes";

type MatchRow = { id: string; result: string; events: number };

type ResultsState = {
  source: string;
  finals: number;
  total: number;
  cup: { europe: number; usa: number };
  awards: { mvp: string | null; topScorer: string | null; rookie: string | null };
  matches: MatchRow[];
};

type OrderRow = {
  ref: string;
  email: string;
  planId: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  createdAt: string;
  paidAt: string | null;
  note: string | null;
};

type Money = {
  provider: string;
  grossCents: number;
  feeCents: number;
  poolCents: number;
  paidOutCents: number;
  availableCents: number;
  orders: { pending: number; paid: number; failed: number; refunded: number };
};

type Pot = {
  leagueId: string | null;
  label: string;
  potCents: number;
  awardedCents: number;
  paidOutCents: number;
  toSettleCents: number;
};

type Award = {
  id: string;
  leagueId: string | null;
  team: string;
  place: number;
  label: string;
  amountCents: number;
  status: "awarded" | "paid";
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<Tab>("payments");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [results, setResults] = useState<ResultsState | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [summary, setSummary] = useState<Money | null>(null);
  const [awards, setAwards] = useState<Award[]>([]);
  const [prizeTotals, setPrizeTotals] = useState({
    potCents: 0,
    awardedCents: 0,
    paidOutCents: 0,
    unclaimedCents: 0,
  });
  const [unclaimed, setUnclaimed] = useState<{ label: string; cents: number; why: string }[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [potKey, setPotKey] = useState("global");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, string>>({});

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("twentyeight:admin") : null;
    if (saved) {
      setToken(saved);
      setConnected(true);
    }
  }, []);

  const call = useCallback(
    async (path: string, init: RequestInit = {}, key = token) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          authorization: `Bearer ${key}`,
          ...(init.headers ?? {}),
        },
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((data.error as string) ?? `Request failed (${res.status})`);
      return data;
    },
    [token],
  );

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [r, p, z] = await Promise.all([
        call("/api/admin/results"),
        call("/api/admin/orders"),
        call("/api/admin/prizes"),
      ]);
      setResults(r as unknown as ResultsState);
      setOrders((p.orders as OrderRow[]) ?? []);
      setSummary((p.money as Money) ?? null);
      setAwards((z.awards as Award[]) ?? []);
      setPots((z.pots as Pot[]) ?? []);
      setPrizeTotals({
        potCents: Number(z.potCents ?? 0),
        awardedCents: Number(z.awardedCents ?? 0),
        paidOutCents: Number(z.paidOutCents ?? 0),
        unclaimedCents: 0,
      });
      setConnected(true);
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : "Could not reach the admin API.");
    } finally {
      setBusy(false);
    }
  }, [call]);

  useEffect(() => {
    if (connected && token) void load();
    // Only on connect; load() is stable per token.
  }, [connected, token, load]);

  const connect = async () => {
    if (token.length < 16) {
      setError("The admin token is at least 16 characters.");
      return;
    }
    window.sessionStorage.setItem("twentyeight:admin", token);
    setConnected(true);
    await load();
  };

  const setResult = async (id: string, result: string) => {
    setPending((p) => ({ ...p, [id]: result }));
    try {
      await call("/api/admin/results", {
        method: "POST",
        body: JSON.stringify({ matches: { [id]: { result } } }),
      });
      setNote(`Corrected ${id} → ${result}. The table has re-scored.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed.");
    }
  };

  const clearCorrections = async () => {
    try {
      await call("/api/admin/results", { method: "DELETE" });
      setNote("Corrections cleared — back to the simulated final.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear corrections.");
    }
  };

  const refund = async (ref: string) => {
    try {
      await call("/api/admin/orders", { method: "POST", body: JSON.stringify({ ref, action: "refund" }) });
      setNote(`${ref} refunded — the entry is no longer prize-eligible.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed.");
    }
  };

  const settle = async (leagueId: string | null) => {
    try {
      const data = await call("/api/admin/prizes", {
        method: "POST",
        body: JSON.stringify({ action: "settle", leagueId }),
      });
      const list = (data.awards as Award[]) ?? [];
      const lines = (data.unclaimed as { label: string; cents: number; why: string }[]) ?? [];
      setUnclaimed(lines);
      setNote(
        `Settled a ${money(Number(data.potCents ?? 0))} pot into ${list.length} award(s)` +
          (lines.length ? `; ${lines.length} line(s) could not be awarded.` : "."),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settlement failed.");
    }
  };

  const payOut = async (leagueId: string | null) => {
    try {
      await call("/api/admin/prizes", { method: "POST", body: JSON.stringify({ action: "pay", leagueId }) });
      setNote("Prizes marked paid — the ledger has the payouts.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payout failed.");
    }
  };

  const selected = pots.find((pot) => (pot.leagueId ?? "global") === potKey) ?? null;
  const potAwards = awards.filter((award) => (award.leagueId ?? "global") === potKey);

  const statusPill = (status: string) => {
    const tone =
      status === "paid"
        ? "bg-shamrock/15 text-shamrock"
        : status === "pending"
          ? "bg-gold/15 text-gold"
          : status === "refunded"
            ? "bg-white/10 text-cream/70"
            : "bg-usa/15 text-usa";
    return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${tone}`}>{status}</span>;
  };

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <Eyebrow>Operator</Eyebrow>
        <h1 className="mt-2 text-4xl text-cream">Correction console</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-cream/70">
          Paste the <code className="text-cream/85">ADMIN_TOKEN</code> this build was started with.
          It stays in this tab: nothing is stored on the server and it is never baked into the bundle.
        </p>
        <label className="mt-6 block">
          <span className="text-[10px] uppercase tracking-[0.14em] text-cream/60">Admin token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void connect();
            }}
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-white/12 bg-forest-950/60 px-3 py-2.5 text-[13px] text-cream outline-none focus:border-gold/60"
          />
        </label>
        <button
          type="button"
          onClick={connect}
          className="mt-4 rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold text-forest-950 transition hover:bg-gold-soft"
        >
          Connect
        </button>
        {error ? (
          <p className="mt-4 rounded-lg border border-usa/30 bg-usa/10 px-3 py-2 text-[11.5px] text-usa">
            {error}
          </p>
        ) : null}
        <p className="mt-6 text-[11px] leading-relaxed text-cream/50">
          Without <code>ADMIN_TOKEN</code> the admin API returns 503 rather than opening up — the
          console cannot be used on a build that has not been configured for it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Operator</Eyebrow>
          <h1 className="mt-2 text-4xl text-cream">Correction console</h1>
          <p className="mt-2 text-[13px] text-cream/65">
            Results, payments and the prize ledger. Every action here is the same call the tests make.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="rounded-full border border-white/15 px-4 py-2 text-[12px] text-cream/80 transition hover:border-gold/60 disabled:opacity-50"
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              window.sessionStorage.removeItem("twentyeight:admin");
              setToken("");
              setConnected(false);
            }}
            className="rounded-full border border-white/10 px-4 py-2 text-[12px] text-cream/50 transition hover:text-cream"
          >
            Disconnect
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Admin sections" className="mt-6 flex gap-1.5">
        {(["payments", "prizes", "results"] as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] capitalize transition ${
              tab === key ? "bg-white/[0.08] text-cream" : "text-cream/60 hover:text-cream"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {note ? (
        <p role="status" className="mt-4 rounded-lg border border-shamrock/25 bg-shamrock/10 px-3 py-2 text-[11.5px] text-shamrock">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-usa/30 bg-usa/10 px-3 py-2 text-[11.5px] text-usa">
          {error}
        </p>
      ) : null}

      {tab === "payments" && summary ? (
        <section className="mt-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Taken", value: money(summary.grossCents), hint: `${summary.orders.paid} paid orders` },
              { label: "Fees", value: money(summary.feeCents), hint: "5% platform & card" },
              { label: "Prize pool", value: money(summary.poolCents), hint: "95% of every entry" },
              { label: "Paid out", value: money(summary.paidOutCents), hint: `${money(summary.availableCents)} left` },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <p className="eyebrow text-cream/55">{card.label}</p>
                <p className="mt-1 text-2xl text-cream tnum">{card.value}</p>
                <p className="text-[11px] text-cream/50">{card.hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-cream/55">
                <tr>
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-cream/50">
                      No orders yet — buy an entry to see one here.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.ref} className="border-t border-white/[0.07]">
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-cream/80">{order.ref}</td>
                      <td className="px-4 py-2.5 text-cream/70">{order.email}</td>
                      <td className="px-4 py-2.5 text-cream/70">{order.planId}</td>
                      <td className="px-4 py-2.5 text-right text-cream tnum">{money(order.amountCents)}</td>
                      <td className="px-4 py-2.5">{statusPill(order.status)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {order.status === "paid" ? (
                          <button
                            type="button"
                            onClick={() => void refund(order.ref)}
                            className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-cream/75 transition hover:border-usa/60 hover:text-usa"
                          >
                            Refund
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "prizes" ? (
        <section className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[12px] text-cream/70">
              Pot
              <select
                value={potKey}
                onChange={(event) => {
                  setPotKey(event.target.value);
                  setUnclaimed([]);
                  setNote(null);
                }}
                className="rounded-lg border border-white/15 bg-forest-950 px-2.5 py-1.5 text-[12.5px] text-cream"
              >
                <option value="global">Global</option>
                {pots
                  .filter((pot) => pot.leagueId)
                  .map((pot) => (
                    <option key={pot.leagueId} value={pot.leagueId as string}>
                      {pot.label}
                    </option>
                  ))}
              </select>
            </label>
            {selected ? (
              <p className="text-[11.5px] text-cream/50">
                {selected.label} · {money(selected.potCents)} funded by{" "}
                {selected.potCents === 0 ? "no paid entries" : "paid entries in this pot"}
              </p>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Prize pool", value: money(selected?.potCents ?? 0) },
              { label: "Awarded", value: money(selected?.awardedCents ?? 0) },
              { label: "Paid out", value: money(selected?.paidOutCents ?? 0) },
              { label: "To settle", value: money(selected?.toSettleCents ?? 0) },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <p className="eyebrow text-cream/55">{card.label}</p>
                <p className="mt-1 text-2xl text-cream tnum">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void settle(potKey === "global" ? null : potKey)}
              className="rounded-full bg-gold px-4 py-2 text-[12.5px] font-semibold text-forest-950 transition hover:bg-gold-soft"
            >
              Settle this pot
            </button>
            <button
              type="button"
              onClick={() => void payOut(potKey === "global" ? null : potKey)}
              className="rounded-full border border-white/15 px-4 py-2 text-[12.5px] text-cream/80 transition hover:border-gold/60"
            >
              Mark paid
            </button>
          </div>

          {unclaimed.length ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="eyebrow text-cream/55">Not awarded</p>
              <ul className="mt-1.5 space-y-1 text-[11.5px] text-cream/65">
                {unclaimed.map((line) => (
                  <li key={line.label}>
                    <span className="text-cream/85">{line.label}</span> · {money(line.cents)} — {line.why}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-cream/55">
                <tr>
                  <th className="px-4 py-2.5">Place</th>
                  <th className="px-4 py-2.5">Team</th>
                  <th className="px-4 py-2.5">Award</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {potAwards.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-cream/50">
                      Nothing settled yet. Settle the pot to award the published split.
                    </td>
                  </tr>
                ) : (
                  potAwards.map((award) => (
                    <tr key={award.id} className="border-t border-white/[0.07]">
                      <td className="px-4 py-2.5 text-cream/70 tnum">#{award.place}</td>
                      <td className="px-4 py-2.5 text-cream">{award.team}</td>
                      <td className="px-4 py-2.5 text-cream/70">{award.label}</td>
                      <td className="px-4 py-2.5 text-right text-cream tnum">{money(award.amountCents)}</td>
                      <td className="px-4 py-2.5">{statusPill(award.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "results" && results ? (
        <section className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div>
              <p className="eyebrow text-cream/55">Results source</p>
              <p className="mt-1 text-[13px] text-cream">
                {results.source} · {results.finals}/{results.total} finals · cup {results.cup.europe}–
                {results.cup.usa}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void clearCorrections()}
              className="rounded-full border border-white/15 px-4 py-2 text-[12px] text-cream/80 transition hover:border-usa/60 hover:text-usa"
            >
              Clear corrections
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-cream/55">
                <tr>
                  <th className="px-4 py-2.5">Match</th>
                  <th className="px-4 py-2.5">Events</th>
                  <th className="px-4 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.matches.slice(0, 12).map((match) => (
                  <tr key={match.id} className="border-t border-white/[0.07]">
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-cream/80">{match.id}</td>
                    <td className="px-4 py-2.5 text-cream/60">{match.events}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        {["europe", "half", "usa"].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => void setResult(match.id, value)}
                            aria-pressed={(pending[match.id] ?? match.result) === value}
                            className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition ${
                              (pending[match.id] ?? match.result) === value
                                ? "border-gold/60 bg-gold/15 text-gold"
                                : "border-white/12 text-cream/60 hover:text-cream"
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-cream/50">
            Showing the first 12 of {results.matches.length} matches. Corrections are stored with the
            rest of the demo data and re-score the table immediately.
          </p>
        </section>
      ) : null}
    </div>
  );
}
