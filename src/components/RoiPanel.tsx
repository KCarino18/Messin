"use client";

import { formatUsd } from "@/lib/money";

export type ProductRoiView = {
  productName: string;
  setName: string;
  buyPriceCents: number;
  buyLabel: string;
  message: string;
  cardCount: number;
  roi: {
    packCount: number;
    expectedGrossCents: number;
    expectedNetCents: number;
    buyPriceCents: number;
    roiPercent: number;
    breakEvenChancePercent: number;
    trials: number;
    model: string;
    notes: string[];
  } | null;
};

type Props = {
  data: ProductRoiView | null;
  loading?: boolean;
};

export function RoiPanel({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-md border border-[var(--line)] bg-[var(--mist)]/40 px-4 py-3 text-sm text-[var(--parchment)]/60">
        Crunching set EV and break-even odds…
      </div>
    );
  }
  if (!data) return null;

  const chance = data.roi?.breakEvenChancePercent;
  const chanceColor =
    chance == null
      ? "text-[var(--parchment)]"
      : chance >= 45
        ? "text-[var(--emerald-300)]"
        : chance >= 25
          ? "text-[var(--brass-300)]"
          : "text-[#e8a0a0]";

  return (
    <div className="space-y-3 rounded-md border border-[var(--line)] bg-[rgba(16,28,24,0.85)] px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--brass-300)]/80">
            Set ROI · {data.setName}
          </p>
          <h3 className="font-display text-xl text-[var(--parchment)]">{data.productName}</h3>
        </div>
        {data.roi && (
          <p className={`font-display text-3xl ${chanceColor}`}>
            {data.roi.breakEvenChancePercent}%
          </p>
        )}
      </div>

      <p className="text-sm leading-relaxed text-[var(--parchment)]/80">{data.message}</p>

      {data.roi && (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[var(--parchment)]/45">
              Display / box cost
            </dt>
            <dd className="text-[var(--parchment)]">
              {formatUsd(data.buyPriceCents)}
              <span className="block text-[10px] text-[var(--parchment)]/40">
                {data.buyLabel}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[var(--parchment)]/45">
              Expected net
            </dt>
            <dd className="text-[var(--parchment)]">
              {formatUsd(data.roi.expectedNetCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[var(--parchment)]/45">
              ROI
            </dt>
            <dd className={data.roi.roiPercent >= 0 ? "text-[var(--emerald-300)]" : "text-[#e8a0a0]"}>
              {data.roi.roiPercent >= 0 ? "+" : ""}
              {data.roi.roiPercent}%
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-[var(--parchment)]/45">
              Break-even chance
            </dt>
            <dd className={chanceColor}>{data.roi.breakEvenChancePercent}%</dd>
          </div>
        </dl>
      )}

      {data.roi && (
        <p className="text-[11px] leading-snug text-[var(--parchment)]/40">
          {data.roi.model}. {data.roi.packCount} packs · {data.cardCount} cards @
          TCGPlayer market · {data.roi.trials.toLocaleString()} sims.{" "}
          {data.roi.notes[0]}
        </p>
      )}
    </div>
  );
}
