"use client";

import { useState, useTransition } from "react";
import { formatUsd } from "@/lib/money";
import { desktop } from "@/lib/desktopClient";

type Props = {
  initialCents: number;
  onBudgetChange: (cents: number) => void;
};

export function BudgetSetter({ initialCents, onBudgetChange }: Props) {
  const [dollars, setDollars] = useState(String(Math.round(initialCents / 100)));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(amount) || amount < 500) return;

    startTransition(async () => {
      const data = await desktop().setBudget(amount);
      onBudgetChange(data.amountCents);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--brass-300)]/80">
          Your sealed budget
        </span>
        <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--mist)] px-3 py-2 backdrop-blur-sm">
          <span className="font-display text-[var(--brass-300)]">$</span>
          <input
            type="number"
            min={5}
            step={1}
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-28 bg-transparent text-lg text-[var(--parchment)] outline-none"
          />
        </div>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="cta-foil rounded-md border border-[var(--brass-400)]/50 bg-[linear-gradient(135deg,#3d9b72,#245c45)] px-5 py-2.5 text-sm font-semibold tracking-wide text-[var(--parchment)] transition hover:border-[var(--brass-300)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Find deals"}
      </button>
      {saved && (
        <span className="text-sm text-[var(--emerald-300)]">
          Locked at {formatUsd(Math.round(Number(dollars) * 100))}
        </span>
      )}
    </form>
  );
}
