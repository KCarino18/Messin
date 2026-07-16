import { catalogById } from "@/lib/catalog/products";
import type { SealedTypeId } from "@/lib/sealedTypes";
import { loadPricedCardsForSet } from "./cardData";
import { scryfallCodeForSet } from "./setMeta";
import { simulateSealedRoi, type RoiResult } from "./simulate";

export type ProductRoiResponse = {
  productId: string;
  productName: string;
  setName: string;
  sealedType: SealedTypeId;
  buyPriceCents: number;
  buyLabel: string;
  scryfallCode: string | null;
  cardCount: number;
  roi: RoiResult | null;
  message: string;
  unsupportedReason?: string;
};

export async function buildProductRoi(options: {
  productId: string;
  productName: string;
  setName: string;
  sealedType: SealedTypeId;
  buyPriceCents: number;
  itemPriceCents?: number;
  buyLabel?: string;
}): Promise<ProductRoiResponse> {
  const buyLabel = options.buyLabel ?? "best live listing";
  const code = scryfallCodeForSet(options.setName);
  const displayPriceCents = options.itemPriceCents ?? options.buyPriceCents;

  const base = {
    productId: options.productId,
    productName: options.productName,
    setName: options.setName,
    sealedType: options.sealedType,
    buyPriceCents: options.buyPriceCents,
    buyLabel,
    scryfallCode: code,
    cardCount: 0,
  };

  if (
    options.sealedType !== "play_booster_box" &&
    options.sealedType !== "collector_booster_display" &&
    options.sealedType !== "bundle"
  ) {
    return {
      ...base,
      roi: null,
      message: `ROI odds aren’t modeled yet for ${options.sealedType.replace(/_/g, " ")}.`,
      unsupportedReason: "sealed_type",
    };
  }

  if (!code) {
    return {
      ...base,
      roi: null,
      message: `No card-price map yet for ${options.setName}.`,
      unsupportedReason: "missing_set_map",
    };
  }

  if (options.buyPriceCents <= 0) {
    return {
      ...base,
      roi: null,
      message: "Need a live buy price before estimating break-even odds.",
      unsupportedReason: "missing_price",
    };
  }

  try {
    const cards = await loadPricedCardsForSet(options.setName);
    const roi = simulateSealedRoi({
      cards,
      sealedType: options.sealedType,
      buyPriceCents: options.buyPriceCents,
    });

    if (!roi) {
      return {
        ...base,
        cardCount: cards.length,
        roi: null,
        message: `Not enough priced rares/mythics yet for ${options.setName}.`,
        unsupportedReason: "insufficient_cards",
      };
    }

    const productWord =
      options.sealedType === "collector_booster_display"
        ? "display"
        : options.sealedType === "bundle"
          ? "bundle"
          : "box";
    const sticker = (displayPriceCents / 100).toFixed(0);
    const landed = (options.buyPriceCents / 100).toFixed(0);
    const chance = roi.breakEvenChancePercent;
    const tone =
      chance >= 45
        ? "decent shot"
        : chance >= 25
          ? "uphill"
          : "long shot";

    return {
      ...base,
      cardCount: cards.length,
      roi,
      message: `Hey — the ${productWord} costs about $${sticker} (${buyLabel}${sticker !== landed ? `, ~$${landed} landed` : ""}). Estimated chance you get your investment back after cracking and selling the singles is ${chance}% (${tone}). Expected net value ~$${(roi.expectedNetCents / 100).toFixed(0)} vs ~$${landed} landed (ROI ${roi.roiPercent}%).`,
    };
  } catch (error) {
    return {
      ...base,
      roi: null,
      message: `Couldn’t load set prices for ROI (${error instanceof Error ? error.message : "error"}).`,
      unsupportedReason: "fetch_failed",
    };
  }
}

export async function buildProductRoiFromCatalog(
  productId: string,
  buyPriceCents: number,
  buyLabel?: string,
  itemPriceCents?: number,
): Promise<ProductRoiResponse | null> {
  const seed = catalogById(productId);
  if (!seed) return null;
  return buildProductRoi({
    productId: seed.id,
    productName: seed.name,
    setName: seed.setName,
    sealedType: seed.sealedType,
    buyPriceCents,
    itemPriceCents,
    buyLabel,
  });
}
