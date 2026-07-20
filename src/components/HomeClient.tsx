"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ApiSettingsPanel } from "@/components/ApiSettingsPanel";
import { BudgetSetter } from "@/components/BudgetSetter";
import { DealList, type Deal } from "@/components/DealList";
import { ProductSearch } from "@/components/ProductSearch";
import { PreorderRadar } from "@/components/PreorderRadar";
import { SealedTypeFilter } from "@/components/SealedTypeFilter";
import { desktop } from "@/lib/desktopClient";
import { SEALED_TYPES, type SealedTypeId } from "@/lib/sealedTypes";

const DEFAULT_TYPES = SEALED_TYPES.map((t) => t.id);

export function HomeClient({ initialBudgetCents }: { initialBudgetCents: number }) {
  const [budgetCents, setBudgetCents] = useState(initialBudgetCents);
  const [sealedTypes, setSealedTypes] = useState<SealedTypeId[]>(DEFAULT_TYPES);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [mode, setMode] = useState("demo");
  const [loading, startTransition] = useTransition();
  const [radarOpen, setRadarOpen] = useState(false);

  const loadDeals = useCallback((cents: number, types: SealedTypeId[]) => {
    startTransition(async () => {
      const data = (await desktop().getDeals(cents, types)) as {
        deals: Deal[];
        mode: string;
      };
      setDeals(data.deals);
      setMode(data.mode);
    });
  }, []);

  useEffect(() => {
    loadDeals(budgetCents, sealedTypes);
  }, [budgetCents, sealedTypes, loadDeals]);

  return (
    <div className="app-root flex min-h-screen">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative overflow-hidden px-6 pb-10 pt-10 sm:px-10 lg:px-14 lg:pt-14">
          <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-[var(--emerald-400)]/10 blur-3xl" />
          <div className="pointer-events-none absolute right-10 top-8 h-40 w-40 rounded-full bg-[var(--brass-400)]/10 blur-3xl" />

          <p className="text-xs uppercase tracking-[0.35em] text-[var(--emerald-300)]/80">
            Sealed product · US reputable retailers
          </p>
          <h1 className="foil-text mt-3 font-display text-5xl leading-none tracking-wide sm:text-6xl lg:text-7xl">
            MTG Budget
          </h1>
          <p className="mt-4 max-w-xl text-base text-[var(--parchment)]/70 sm:text-lg">
            Set a spend ceiling and filter by sealed type. We search dozens of
            real retailer product pages (Card Kingdom, GameNerdz, Miniature
            Market, Troll and Toad, TCGPlayer, and more) — never invented prices.
          </p>

          <div className="mt-8 space-y-5">
            <UpdateBanner />
            <BudgetSetter
              initialCents={budgetCents}
              onBudgetChange={(cents) => setBudgetCents(cents)}
            />
            <div className="max-w-3xl">
              <SealedTypeFilter selected={sealedTypes} onChange={setSealedTypes} />
            </div>
            <ApiSettingsPanel />
          </div>

          <button
            type="button"
            onClick={() => setRadarOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-xs uppercase tracking-widest text-[var(--brass-300)] lg:hidden"
          >
            <span className="radar-live-dot inline-block h-2 w-2 rounded-full bg-[var(--emerald-400)]" />
            Open Preorder Radar
          </button>
        </header>

        <main className="flex-1 space-y-12 px-6 pb-16 sm:px-10 lg:px-14">
          <section>
            <h2 className="font-display text-2xl text-[var(--brass-200)]">
              Best rip ROI under budget
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--parchment)]/60">
              Ranked for cracking — highest expected singles ROI first, not just
              cheapest vs MSRP.
            </p>
            <div className="mt-5">
              <DealList
                deals={deals}
                budgetCents={budgetCents}
                loading={loading}
                mode={mode}
              />
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[var(--brass-200)]">
              Find the cheapest reputable buy
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--parchment)]/60">
              Select a sealed product for live retailer prices plus set ROI — buy
              cost vs estimated chance of getting your money back after cracking and
              selling the singles.
            </p>
            <div className="mt-5 max-w-2xl">
              <ProductSearch />
            </div>
          </section>
        </main>
      </div>

      <div className="sticky top-0 h-screen w-0 shrink-0 lg:w-[22rem] xl:w-[24rem]">
        <PreorderRadar
          mobileOpen={radarOpen}
          onCloseMobile={() => setRadarOpen(false)}
        />
      </div>
    </div>
  );
}
