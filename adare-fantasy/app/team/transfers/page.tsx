"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eyebrow, Stat, TeamDot } from "@/components/ui";
import { credits } from "@/lib/helpers";

type Player = {
  id: string;
  name: string;
  shortName: string;
  side: "europe" | "usa";
  price: number;
  projected: number;
  role: string;
  captain: boolean;
};

type Overview = {
  entry: { ref: string; team: string; manager: string };
  mode: "classic" | "full";
  squad: Player[];
  captain: string | null;
  sessionCaptains: { fri?: string | null; sat?: string | null; sun?: string | null };
  state: {
    minute: number;
    open: boolean;
    window: { id: string; label: string; closes: number } | null;
    next: { id: string; label: string; opens: number } | null;
    used: number;
    free: number;
    bonus: number;
    remainingFree: number;
    cost: number;
    penaltyPaid: number;
  };
  transfers: { out: string; in: string; at: string; window: string; penalty: number }[];
  options: Record<string, Player[]>;
};

const DAYS = [
  { id: "fri", label: "Friday", sub: "Foursomes + fourball" },
  { id: "sat", label: "Saturday", sub: "Foursomes + fourball" },
  { id: "sun", label: "Sunday", sub: "Singles, ×2 on 6 points" },
] as const;

const WINDOW_LABEL: Record<string, string> = {
  pre: "before the first tee",
  "fri-sat": "Friday night",
  "sat-sun": "Saturday night",
};

export default function TransfersPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/entry/transfer", { cache: "no-store" });
    if (res.status === 401) {
      setSignedOut(true);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as Overview & { error?: string };
    if (!res.ok) {
      setError(body.error ?? "Could not read your card.");
      return;
    }
    setSignedOut(false);
    setData(body);
  }, []);

  // Keep a useful selection: the first player who actually has a replacement.
  useEffect(() => {
    if (!data) return;
    const options = (id: string | null) => (id ? data.options[id]?.length ?? 0 : 0);
    if (options(drop) > 0) return;
    const next = data.squad.find((player) => options(player.id) > 0) ?? data.squad[0];
    setDrop(next?.id ?? null);
  }, [data, drop]);

  useEffect(() => {
    load().catch(() => setError("Could not reach the server."));
  }, [load]);

  const chosen = useMemo(() => data?.squad.find((p) => p.id === drop) ?? null, [data, drop]);

  const swap = async (inId: string) => {
    if (!data || !drop) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    const res = await fetch("/api/entry/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ out: drop, in: inId }),
    });
    const body = (await res.json().catch(() => ({}))) as Overview & { error?: string; penalty?: number };
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "That transfer could not be made.");
      return;
    }
    setData(body);
    setNotice(
      body.penalty
        ? `Done — ${body.penalty} points deducted for a transfer over your allowance.`
        : "Done — that change was free.",
    );
  };

  const setArmband = async (day: "fri" | "sat" | "sun", id: string | null) => {
    if (!data) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/entry/transfer", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [day]: id }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; sessionCaptains?: Overview["sessionCaptains"] };
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not set the armband.");
      return;
    }
    setData({ ...data, sessionCaptains: body.sessionCaptains ?? data.sessionCaptains });
    setNotice(
      id
        ? `${DAYS.find((d) => d.id === day)?.label} armband: ${data.squad.find((p) => p.id === id)?.shortName}.`
        : `No armband on ${DAYS.find((d) => d.id === day)?.label}.`,
    );
  };

  if (signedOut) {
    return (
      <Shell>
        <Eyebrow>Transfers</Eyebrow>
        <h1 className="mt-2 text-3xl text-ink sm:text-4xl">Change your card between sessions</h1>
        <p className="mt-4 rounded-xl border border-ink/12 bg-surface p-5 text-[14px] text-ink-soft">
          Sign in from the <Link href="/account" className="text-accent underline decoration-accent/40">account page</Link> to
          make transfers — a paid entry is needed first.
        </p>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <p className="text-[14px] text-ink-soft">{error ?? "Reading your card…"}</p>
      </Shell>
    );
  }

  const { state } = data;

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Transfers · {data.entry.ref}</Eyebrow>
          <h1 className="mt-2 text-3xl text-ink sm:text-4xl">Change your card between sessions</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
            Two changes are free for the whole edition. After that each one costs{" "}
            <span className="text-accent">−4 points</span>, taken off your total, not your card.
            Windows are open only between sessions — never while a match is under way.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            state.open
              ? "border-sage/40 bg-sage/10 text-sage"
              : "border-ink/15 bg-surface-2 text-ink-soft"
          }`}
        >
          {state.open ? `Window open · ${state.window?.label}` : "Transfers closed"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Free transfers left" value={`${state.remainingFree}`} sub={`${state.used} made · ${state.free} allowed`} />
        <Stat label="Next change costs" value={state.cost === 0 ? "Free" : `−${state.cost}`} sub="Deducted from your total" />
        <Stat label="Points paid" value={`${state.penaltyPaid}`} sub="Across this edition" />
        <Stat
          label="Clock"
          value={state.minute < 0 ? "Pre-lock" : `Minute ${state.minute}`}
          sub={state.minute < 0 ? "Edits free until the first tee" : "Minutes since the first tee"}
        />
      </div>

      {state.bonus > 0 && (
        <p className="mt-3 rounded-lg border border-sage/30 bg-sage/[0.06] px-4 py-2.5 text-[12.5px] text-sage">
          {state.bonus} extra free transfer{state.bonus === 1 ? "" : "s"} from invites.
        </p>
      )}

      {(error || notice) && (
        <p
          className={`mt-4 rounded-lg border px-4 py-2.5 text-[12.5px] ${
            error ? "border-clay/40 bg-clay/[0.08] text-clay" : "border-sage/35 bg-sage/[0.07] text-sage"
          }`}
          role="status"
        >
          {error ?? notice}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Your card</h2>
          <ul className="mt-3 space-y-2">
            {data.squad.map((player) => {
              const active = drop === player.id;
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => setDrop(player.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      active ? "border-accent/60 bg-accent/[0.07]" : "border-line bg-surface hover:border-ink/25"
                    }`}
                  >
                    <TeamDot side={player.side} />
                    <span className="flex-1">
                      <span className="block text-[13.5px] text-ink">{player.shortName}</span>
                      <span className="block text-[11px] text-ink-soft">{player.role}</span>
                    </span>
                    <span className="text-right text-[11px] text-ink-soft">
                      <span className="block tabular-nums">{credits(player.price)}m</span>
                      <span className="block tabular-nums text-ink-muted">{player.projected} proj.</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {chosen ? `Replace ${chosen.shortName}` : "Pick a player to replace"}
          </h2>
          <p className="mt-2 text-[12px] text-ink-soft">
            Only players who keep your card legal — budget and the six-a-side cap — are listed.
          </p>
          <ul className="mt-3 space-y-2">
            {(drop ? data.options[drop] ?? [] : []).slice(0, 8).map((player) => (
              <li key={player.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <TeamDot side={player.side} />
                <span className="flex-1">
                  <span className="block text-[13.5px] text-ink">{player.shortName}</span>
                  <span className="block text-[11px] text-ink-soft">
                    {credits(player.price)}m · {player.projected} projected
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy || !state.open}
                  onClick={() => swap(player.id)}
                  className="rounded-full border border-ink/20 px-3 py-1.5 text-[11.5px] font-medium text-ink/80 transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {state.cost === 0 ? "Swap in · free" : `Swap in · −${state.cost}`}
                </button>
              </li>
            ))}
            {drop && (data.options[drop] ?? []).length === 0 && (
              <li className="rounded-xl border border-line bg-surface px-3 py-3 text-[12px] text-ink-soft">
                Nothing fits the budget for that swap — try dropping a different player.
              </li>
            )}
          </ul>
          {!state.open && (
            <p className="mt-3 rounded-lg border border-ink/12 bg-surface px-3 py-2 text-[12px] text-ink-soft">
              {state.next
                ? `Closed while play is under way. The ${state.next.label.toLowerCase()} window opens at minute ${state.next.opens}.`
                : "The weekend is over — no windows remain."}
            </p>
          )}
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">The armband, day by day</h2>
        <p className="mt-2 max-w-2xl text-[12.5px] text-ink-soft">
          One captain doubles his match points. Give the armband per day and it doubles that day only — so a
          Saturday fourball win can be doubled without also doubling a quiet Friday.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {DAYS.map((day) => {
            const value = data.sessionCaptains[day.id] ?? "";
            return (
              <label key={day.id} className="rounded-xl border border-line bg-surface p-3">
                <span className="block text-[12px] text-ink-soft">{day.label}</span>
                <span className="block text-[10.5px] text-ink-soft">{day.sub}</span>
                <select
                  value={value}
                  disabled={busy}
                  onChange={(event) => setArmband(day.id, event.target.value || null)}
                  className="mt-2 w-full rounded-lg border border-ink/15 bg-surface px-2 py-1.5 text-[12.5px] text-ink"
                >
                  <option value="">No armband</option>
                  {data.squad.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.shortName}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </section>

      {data.transfers.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Transfer history</h2>
          <ul className="mt-3 divide-y divide-ink/[0.06] rounded-xl border border-line">
            {[...data.transfers].reverse().map((t, index) => (
              <li key={`${t.at}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px]">
                <span className="text-ink-soft">
                  {t.out} → {t.in}
                </span>
                <span className="text-ink-soft">
                  {WINDOW_LABEL[t.window] ?? t.window} · {t.penalty === 0 ? "free" : `−${t.penalty}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-[12px] text-ink-soft">
        See the points this card has scored on the <Link href="/account" className="text-accent underline decoration-accent/40">account page</Link>,
        or read the <Link href="/rules" className="text-accent underline decoration-accent/40">rules</Link>.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-10">{children}</div>;
}
