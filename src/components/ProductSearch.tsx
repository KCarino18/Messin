"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { formatUsd } from "@/lib/money";
import { desktop, openProductLink } from "@/lib/desktopClient";
import { RoiPanel, type ProductRoiView } from "@/components/RoiPanel";

type Product = {
  id: string;
  name: string;
  setName: string;
  category: string;
  msrpCents: number;
};

type Offer = {
  id: string;
  retailerName: string;
  sellerName: string;
  itemPriceCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  url: string;
  isDemo: boolean;
};

export function ProductSearch() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [blockedRetailers, setBlockedRetailers] = useState<
    Array<{ retailerName: string; url: string; reason: string }>
  >([]);
  const [mode, setMode] = useState<string>("demo");
  const [roi, setRoi] = useState<ProductRoiView | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const data = (await desktop().searchProducts(deferredQuery)) as {
        products: Product[];
      };
      if (!cancelled) setProducts(data.products);
    });
    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  async function selectProduct(id: string) {
    setSelectedId(id);
    setRoi(null);
    setRoiLoading(true);
    setBlockedRetailers([]);
    try {
      const [offerData, roiData] = await Promise.all([
        desktop().getOffers(id) as Promise<{
          offers: Offer[];
          mode: string;
          blockedRetailers?: Array<{ retailerName: string; url: string; reason: string }>;
        } | null>,
        desktop().getProductRoi(id) as Promise<ProductRoiView | null>,
      ]);
      if (offerData) {
        setOffers(offerData.offers);
        setMode(offerData.mode);
        setBlockedRetailers(offerData.blockedRetailers ?? []);
      } else {
        setOffers([]);
      }
      setRoi(roiData);
    } finally {
      setRoiLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--brass-300)]/80">
          Lookup sealed product
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Marvel Collector Display, Hobbit Play Box"
          className="rounded-md border border-[var(--line)] bg-[var(--mist)] px-3 py-2.5 text-[var(--parchment)] outline-none placeholder:text-[var(--parchment)]/35 focus:border-[var(--brass-400)]/70"
        />
      </label>

      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {pending && products.length === 0 && (
          <li className="text-sm text-[var(--parchment)]/50">Searching catalog…</li>
        )}
        {products.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => void selectProduct(p.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                selectedId === p.id
                  ? "bg-[var(--emerald-400)]/15 text-[var(--parchment)]"
                  : "text-[var(--parchment)]/75 hover:bg-[var(--mist)]"
              }`}
            >
              <span className="font-medium">{p.name}</span>
              <span className="ml-2 text-[var(--parchment)]/45">
                {p.setName} · MSRP {formatUsd(p.msrpCents)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {(roiLoading || roi) && <RoiPanel data={roi} loading={roiLoading} />}

      {offers.length > 0 && (
        <div className="space-y-2 border-t border-[var(--line)] pt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg text-[var(--brass-200)]">
              Cheapest reputable total
            </h3>
            {mode === "live" ? (
              <span className="text-[10px] uppercase tracking-widest text-[var(--emerald-300)]/90">
                Live retailers
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-widest text-[var(--brass-300)]/80">
                Demo
              </span>
            )}
          </div>
          <ol className="space-y-3">
            {offers.slice(0, 5).map((offer, index) => (
              <li
                key={offer.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[var(--parchment)]">
                    {index === 0 ? "Best · " : `${index + 1}. `}
                    {offer.retailerName}
                    {offer.sellerName !== offer.retailerName && (
                      <span className="text-[var(--parchment)]/50">
                        {" "}
                        ({offer.sellerName})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--parchment)]/50">
                    item {formatUsd(offer.itemPriceCents)} · ship{" "}
                    {formatUsd(offer.shippingCents)} · tax est.{" "}
                    {formatUsd(offer.taxCents)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-display text-xl text-[var(--emerald-300)]">
                    {formatUsd(offer.totalCents)}
                  </p>
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      void openProductLink(offer.url);
                    }}
                    className="text-xs text-[var(--brass-300)] underline-offset-2 hover:underline"
                  >
                    Open listing
                  </a>
                </div>
              </li>
            ))}
          </ol>
          {blockedRetailers.length > 0 && (
            <div className="mt-3 rounded-md border border-[var(--brass-400)]/25 bg-[rgba(180,140,60,0.08)] px-3 py-2 text-xs text-[var(--parchment)]/70">
              <p className="font-medium text-[var(--brass-300)]">
                Could not auto-read these stores (bot-blocked). Check manually:
              </p>
              <ul className="mt-1.5 space-y-1">
                {blockedRetailers.map((b) => (
                  <li key={`${b.retailerName}-${b.url}`}>
                    <button
                      type="button"
                      onClick={() => void openProductLink(b.url)}
                      className="text-[var(--emerald-300)] underline-offset-2 hover:underline"
                    >
                      {b.retailerName}
                    </button>
                    <span className="text-[var(--parchment)]/45"> — {b.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
