import type { RetailerId } from "./allowlist";
import type { SealedTypeId } from "@/lib/sealedTypes";

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
  /** Legacy coarse category kept for search. */
  category: "booster" | "bundle" | "commander" | "box" | "other";
  sealedType: SealedTypeId;
  /** ISO date YYYY-MM-DD (street date). */
  releaseDate: string;
  msrpCents: number;
  imageUrl?: string;
};
