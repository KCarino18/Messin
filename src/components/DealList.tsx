"use client";

import { formatUsd } from "@/lib/money";
import { openProductLink } from "@/lib/desktopClient";
import { SEALED_TYPE_LABELS, type SealedTypeId } from "@/lib/sealedTypes";

export type Deal = {
  product: {
    id: string;
    name: string;
    setName: string;
    category: string;
    sealedType?: string;
    releaseDate?: string;
    msrpCents: number;
  };
  offer: {
    retailerName: string;
    itemPriceCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number;
    url: string;
    isDemo: boolean;
  };
  dealScore: number;
  savingsVsMsrpCents: number;
  /** Expected net EV vs landed buy, after sell friction. Null if ROI unsupported. */
  roiPercent?: number | null;
  breakEvenChancePercent?: number | null;
  expectedNetCents?: number | null;
};

type Props = {
  deals: Deal[];
  budgetCents: number;
  loading?: boolean;
  mode?: string;
};

export function DealList({ deals, budgetCents, loading, mode }: Props) {
  if (loading) {
    return (
      <p className="text-[var(--parchment)]/60">
        Scanning allowlisted retailers and ranking by rip ROI…
      </p>
    );
  }

  if (deals.length === 0) {
    return (
      <p className="text-[var(--parchment)]/70">
        No live retailer listings fit under {formatUsd(budgetCents)} after item +
        shipping + tax. Raise your budget, widen sealed types, or wait while stores
        refresh. Big-box stores (Amazon, Target, Walmart) may need a manual check if
        bot-blocked.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--parchment)]/65">
          Sorted by <em>rip ROI</em> (singles EV vs landed cost) · foil + non-foil
          @ TCGPlayer
        </p>
        {mode === "live" ? (
          <span className="rounded border border-[var(--emerald-400)]/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--emerald-300)]">
            Live retailer listings
          </span>
        ) : (
          <span className="rounded border border-[var(--brass-400)]/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--brass-300)]">
            Demo prices
          </span>
        )}
      </div>
      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {deals.map((deal) => {
          const hasRoi = deal.roiPercent != null;
          const roiPositive = (deal.roiPercent ?? 0) >= 0;
          return (
            <li key={deal.product.id} className="deal-row py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-display text-lg text-[var(--parchment)]">
                    {deal.product.name}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--parchment)]/60">
                    {deal.product.setName} ·{" "}
                    {deal.product.sealedType
                      ? SEALED_TYPE_LABELS[deal.product.sealedType as SealedTypeId] ??
                        deal.product.sealedType
                      : deal.product.category}{" "}
                    · MSRP {formatUsd(deal.product.msrpCents)}
                  </p>
                  <p className="mt-2 text-sm text-[var(--emerald-300)]">
                    {deal.offer.retailerName}
                    {deal.dealScore > 0 && (
                      <span className="ml-2 text-[var(--parchment)]/50">
                        ~{deal.dealScore}% under MSRP landed
                      </span>
                    )}
                  </p>
                  {hasRoi && (
                    <p className="mt-2 text-sm text-[var(--parchment)]/70">
                      <span
                        className={
                          roiPositive
                            ? "text-[var(--emerald-300)]"
                            : "text-[#e8a0a0]"
                        }
                      >
                        ROI {deal.roiPercent! >= 0 ? "+" : ""}
                        {deal.roiPercent}%
                      </span>
                      {deal.breakEvenChancePercent != null && (
                        <span className="ml-2 text-[var(--brass-300)]">
                          {deal.breakEvenChancePercent}% break-even chance
                        </span>
                      )}
                      {deal.expectedNetCents != null && (
                        <span className="ml-2 text-[var(--parchment)]/45">
                          EV net {formatUsd(deal.expectedNetCents)}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  {hasRoi && (
                    <p
                      className={`font-display text-sm tracking-wide ${
                        roiPositive
                          ? "text-[var(--emerald-300)]"
                          : "text-[#e8a0a0]"
                      }`}
                    >
                      {deal.roiPercent! >= 0 ? "+" : ""}
                      {deal.roiPercent}% ROI
                    </p>
                  )}
                  <p className="font-display text-2xl text-[var(--brass-200)]">
                    {formatUsd(deal.offer.totalCents)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--parchment)]/55">
                    item {formatUsd(deal.offer.itemPriceCents)} · ship{" "}
                    {formatUsd(deal.offer.shippingCents)} · tax est.{" "}
                    {formatUsd(deal.offer.taxCents)}
                  </p>
                  <a
                    href={deal.offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      void openProductLink(deal.offer.url);
                    }}
                    className="mt-2 inline-block text-sm text-[var(--emerald-300)] underline-offset-4 hover:underline"
                  >
                    Buy at {deal.offer.retailerName}
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
