import { estimateTaxCents, totalLandedCents } from "@/lib/money";
import { isAllowlistedRetailer, RETAILER_BY_ID } from "./allowlist";
import type { RawOffer, ScoredOffer } from "./types";

const TCG_MIN_RATING = 98;
const TCG_MIN_FEEDBACK = 100;
const UNKNOWN_SHIPPING_PENALTY_CENTS = 2500;

export function scoreOffer(offer: RawOffer, msrpCents: number): ScoredOffer {
  const reject = (reason: string): ScoredOffer => ({
    ...offer,
    shippingCents: offer.shippingCents ?? UNKNOWN_SHIPPING_PENALTY_CENTS,
    taxCents: 0,
    totalCents: Number.MAX_SAFE_INTEGER,
    rejected: true,
    rejectReason: reason,
  });

  if (!isAllowlistedRetailer(offer.retailerId)) {
    return reject("Retailer not on US allowlist");
  }

  const retailer = RETAILER_BY_ID[offer.retailerId];

  if (offer.retailerId === "amazon" && !offer.soldByAmazon) {
    return reject("Amazon 3P marketplace sellers excluded");
  }
  if (offer.retailerId === "target" && !offer.soldByTarget) {
    return reject("Target marketplace sellers excluded");
  }
  if (offer.retailerId === "walmart" && !offer.soldByWalmart) {
    return reject("Walmart 3P marketplace sellers excluded");
  }

  if (retailer.marketplace) {
    if (offer.shipsFromUs === false) {
      return reject("TCGPlayer seller does not ship from US");
    }
    if ((offer.tcgSellerRating ?? 0) < TCG_MIN_RATING) {
      return reject(`TCGPlayer seller rating below ${TCG_MIN_RATING}%`);
    }
    if ((offer.tcgFeedbackCount ?? 0) < TCG_MIN_FEEDBACK) {
      return reject(`TCGPlayer feedback below ${TCG_MIN_FEEDBACK}`);
    }
  }

  if (offer.itemPriceCents < 100 && msrpCents >= 2000) {
    return reject("Penny pricing on sealed SKU (likely scam)");
  }

  const shippingCents =
    offer.shippingCents === null || offer.shippingCents === undefined
      ? UNKNOWN_SHIPPING_PENALTY_CENTS
      : offer.shippingCents;

  if (shippingCents > offer.itemPriceCents * 2) {
    return reject("Shipping exceeds 2x item price");
  }
  if (shippingCents > 10000 && offer.itemPriceCents < 20000) {
    return reject("Extreme shipping on mid-tier sealed product");
  }

  const { taxCents, totalCents } = totalLandedCents(
    offer.itemPriceCents,
    shippingCents,
    offer.taxCents,
  );

  return {
    ...offer,
    shippingCents,
    taxCents,
    totalCents,
    rejected: false,
    rejectReason: null,
  };
}

export function rankOffers(offers: RawOffer[], msrpCents: number): ScoredOffer[] {
  return offers
    .map((o) => scoreOffer(o, msrpCents))
    .filter((o) => !o.rejected && o.inStock)
    .sort((a, b) => a.totalCents - b.totalCents);
}

export function dealScore(totalCents: number, msrpCents: number): number {
  if (msrpCents <= 0) return 0;
  const taxOnMsrp = estimateTaxCents(msrpCents, 0);
  const msrpLanded = msrpCents + taxOnMsrp;
  return Math.round(((msrpLanded - totalCents) / msrpLanded) * 1000) / 10;
}
