import { buildDemoOffers } from "./demoOffers";
import { fetchCardKingdomOffers } from "./fetchers/cardKingdom";
import { fetchPreorderWatchOffers } from "./fetchers/preorderRetailers";
import { fetchWebRetailerOffers } from "./fetchers/webListings";
import {
  estimateTcgShippingCents,
  fetchTcgPlayerPriceInGroup,
} from "./tcgcsv";
import type { ProductSeed, RawOffer } from "./types";

export type FetchOfferOptions = {
  /**
   * When true, also DuckDuckGo-search allowlisted stores and open product pages.
   * Startup catalog sync uses false (TCGPlayer + Card Kingdom only) for speed.
   */
  deep?: boolean;
};

/**
 * Live offers only: open real retailer pages / TCGPlayer market data.
 * Fake demo fixtures are NEVER used unless PRICE_MODE=demo (dev only).
 */
export async function fetchOffersForProduct(
  product: ProductSeed,
  options: FetchOfferOptions = {},
): Promise<{
  offers: RawOffer[];
  mode: "demo" | "live";
}> {
  if (process.env.PRICE_MODE === "demo") {
    return { offers: buildDemoOffers(product), mode: "demo" };
  }

  const offers = await fetchLiveOffers(product, options.deep ?? true);
  return { offers, mode: "live" };
}

async function fetchTcgCsvOffers(product: ProductSeed): Promise<RawOffer[]> {
  if (!product.tcgplayerGroupId || !product.tcgplayerProductId) return [];

  const price = await fetchTcgPlayerPriceInGroup(
    product.tcgplayerGroupId,
    product.tcgplayerProductId,
  );
  if (!price) return [];

  const isPreorderProduct =
    new Date(`${product.releaseDate}T12:00:00Z`).getTime() > Date.now();
  const url =
    price.url || `https://www.tcgplayer.com/product/${product.tcgplayerProductId}`;
  const offers: RawOffer[] = [];
  const low = price.lowPriceCents;
  const market = price.marketPriceCents;

  if (low != null && low > 0) {
    offers.push({
      retailerId: "tcgplayer",
      sellerName: "TCGPlayer (lowest listing)",
      itemPriceCents: low,
      shippingCents: estimateTcgShippingCents(low),
      url,
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: false,
      tcgSellerRating: 99,
      tcgFeedbackCount: 10_000,
      shipsFromUs: true,
    });
  }

  if (market != null && market > 0 && market !== low) {
    offers.push({
      retailerId: "tcgplayer",
      sellerName: "TCGPlayer (market)",
      itemPriceCents: market,
      shippingCents: estimateTcgShippingCents(market),
      url,
      inStock: true,
      isPreorder: isPreorderProduct,
      isDemo: false,
      tcgSellerRating: 99,
      tcgFeedbackCount: 10_000,
      shipsFromUs: true,
    });
  }

  return offers;
}

async function fetchLiveOffers(
  product: ProductSeed,
  deep: boolean,
): Promise<RawOffer[]> {
  const tasks: Array<Promise<RawOffer[]>> = [
    fetchTcgCsvOffers(product),
    fetchCardKingdomOffers(product),
  ];
  if (deep) {
    tasks.push(fetchWebRetailerOffers(product));
    tasks.push(fetchPreorderWatchOffers(product));
  }

  const settled = await Promise.allSettled(tasks);

  const merged: RawOffer[] = [];
  const seen = new Set<string>();

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      console.error("Retailer fetch failed", product.id, result.reason);
      continue;
    }
    for (const offer of result.value) {
      const key = `${offer.retailerId}|${offer.sellerName}|${offer.url}|${offer.itemPriceCents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(offer);
    }
  }

  return merged;
}
