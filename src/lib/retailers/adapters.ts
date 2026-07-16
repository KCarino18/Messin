import { buildDemoOffers } from "./demoOffers";
import type { ProductSeed, RawOffer } from "./types";

/**
 * Per-retailer adapter surface. v1 uses demo fixtures by default.
 * Live scrapers can replace `fetchLiveOffers` without changing ranking.
 */
export async function fetchOffersForProduct(product: ProductSeed): Promise<{
  offers: RawOffer[];
  mode: "demo" | "live";
}> {
  const mode = process.env.PRICE_MODE === "live" ? "live" : "demo";

  if (mode === "live") {
    try {
      const live = await fetchLiveOffers(product);
      if (live.length > 0) {
        return { offers: live, mode: "live" };
      }
    } catch {
      // fall through to demo
    }
  }

  return { offers: buildDemoOffers(product), mode: "demo" };
}

async function fetchLiveOffers(product: ProductSeed): Promise<RawOffer[]> {
  // Placeholder for future allowlisted retailer fetchers.
  // Returning empty forces demo fallback so the app stays usable.
  void product;
  return [];
}
