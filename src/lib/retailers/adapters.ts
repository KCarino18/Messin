import { buildDemoOffers } from "./demoOffers";
import {
  estimateTcgShippingCents,
  fetchTcgPlayerPriceInGroup,
} from "./tcgcsv";
import type { ProductSeed, RawOffer } from "./types";

/**
 * Live prices from TCGPlayer market data (tcgcsv.com daily dump).
 * Demo fixtures are only used when live lookup fails or PRICE_MODE=demo.
 */
export async function fetchOffersForProduct(product: ProductSeed): Promise<{
  offers: RawOffer[];
  mode: "demo" | "live";
}> {
  const forceDemo = process.env.PRICE_MODE === "demo";

  if (!forceDemo) {
    try {
      const live = await fetchLiveOffers(product);
      if (live.length > 0) {
        return { offers: live, mode: "live" };
      }
    } catch (error) {
      console.error("Live price fetch failed", product.id, error);
    }
  }

  return { offers: buildDemoOffers(product), mode: "demo" };
}

async function fetchLiveOffers(product: ProductSeed): Promise<RawOffer[]> {
  if (!product.tcgplayerGroupId || !product.tcgplayerProductId) {
    return [];
  }

  const price = await fetchTcgPlayerPriceInGroup(
    product.tcgplayerGroupId,
    product.tcgplayerProductId,
  );
  if (!price) return [];

  const isPreorderProduct =
    new Date(`${product.releaseDate}T12:00:00Z`).getTime() > Date.now();
  const url = price.url || `https://www.tcgplayer.com/product/${product.tcgplayerProductId}`;
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
