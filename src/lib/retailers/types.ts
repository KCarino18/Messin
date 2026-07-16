import type { RetailerId } from "./allowlist";

export type RawOffer = {
  retailerId: RetailerId;
  sellerName: string;
  itemPriceCents: number;
  shippingCents: number | null;
  taxCents?: number | null;
  url: string;
  inStock: boolean;
  isPreorder: boolean;
  isDemo: boolean;
  soldByAmazon?: boolean;
  soldByTarget?: boolean;
  soldByWalmart?: boolean;
  tcgSellerRating?: number;
  tcgFeedbackCount?: number;
  shipsFromUs?: boolean;
};

export type ScoredOffer = Omit<RawOffer, "shippingCents" | "taxCents"> & {
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  rejected: boolean;
  rejectReason: string | null;
};

export type ProductSeed = {
  id: string;
  name: string;
  setName: string;
  category: "booster" | "bundle" | "commander" | "box" | "other";
  msrpCents: number;
  imageUrl?: string;
};
