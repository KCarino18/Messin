import { prisma } from "@/lib/prisma";
import { SEALED_CATALOG, productSearchText } from "@/lib/catalog/products";
import { RETAILER_BY_ID } from "@/lib/retailers/allowlist";
import { fetchOffersForProduct } from "@/lib/retailers/adapters";
import { dealScore, scoreOffer } from "@/lib/retailers/scorer";
import { buildProductRoiFromCatalog } from "@/lib/roi/service";
import type { ProductSeed } from "@/lib/retailers/types";

function toSeed(product: {
  id: string;
  name: string;
  setName: string;
  category: string;
  sealedType?: string;
  releaseDate?: string;
  msrpCents: number;
  imageUrl: string | null;
}): ProductSeed {
  return {
    id: product.id,
    name: product.name,
    setName: product.setName,
    category: product.category as ProductSeed["category"],
    sealedType: (product.sealedType as ProductSeed["sealedType"]) ?? "play_booster_box",
    releaseDate: product.releaseDate ?? "2099-01-01",
    msrpCents: product.msrpCents,
    imageUrl: product.imageUrl ?? undefined,
  };
}

function enrichOffer(o: {
  id: string;
  retailerId: string;
  sellerName: string;
  itemPriceCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  url: string;
  inStock: boolean;
  isPreorder: boolean;
  isDemo: boolean;
  rejected: boolean;
  rejectReason: string | null;
  observedAt: Date;
}) {
  const retailer = RETAILER_BY_ID[o.retailerId as keyof typeof RETAILER_BY_ID];
  return {
    ...o,
    retailerName: retailer?.name ?? o.retailerId,
    observedAt: o.observedAt.toISOString(),
  };
}

export async function refreshProductOffers(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return [];

  const seed = toSeed(product);
  const { offers, mode, blockedRetailers: _blocked } = await fetchOffersForProduct(seed);
  const scored = offers.map((o) => scoreOffer(o, product.msrpCents));

  await prisma.offer.deleteMany({ where: { productId } });
  await prisma.offer.createMany({
    data: scored.map((o) => ({
      productId,
      retailerId: o.retailerId,
      sellerName: o.sellerName,
      itemPriceCents: o.itemPriceCents,
      shippingCents: o.shippingCents,
      taxCents: o.taxCents,
      totalCents: o.totalCents,
      url: o.url,
      inStock: o.inStock,
      isPreorder: o.isPreorder,
      isDemo: mode === "demo" || o.isDemo,
      rejected: o.rejected,
      rejectReason: o.rejectReason,
    })),
  });

  return prisma.offer.findMany({
    where: { productId, rejected: false, inStock: true },
    orderBy: { totalCents: "asc" },
  });
}

export async function rankedOffersForProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  let offers = await prisma.offer.findMany({
    where: { productId, rejected: false, inStock: true },
    orderBy: { totalCents: "asc" },
  });

  if (offers.length === 0) {
    offers = await refreshProductOffers(productId);
  }

  return {
    product,
    offers: offers.map(enrichOffer),
    best: offers[0] ? enrichOffer(offers[0]) : null,
    mode: offers.some((o) => o.isDemo) ? ("demo" as const) : ("live" as const),
  };
}

export async function searchProducts(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return prisma.product.findMany({ orderBy: { name: "asc" }, take: 24 });
  }
  return prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { setName: { contains: q } },
        { searchText: { contains: q } },
        { category: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
    take: 24,
  });
}

export async function getDealsUnderBudget(budgetCents: number) {
  let products = await prisma.product.findMany({
    include: {
      offers: {
        where: { rejected: false, inStock: true },
        orderBy: { totalCents: "asc" },
        take: 1,
      },
    },
  });

  const needsRefresh = products.filter((p) => p.offers.length === 0);
  for (const p of needsRefresh) {
    await refreshProductOffers(p.id);
  }

  if (needsRefresh.length) {
    products = await prisma.product.findMany({
      include: {
        offers: {
          where: { rejected: false, inStock: true },
          orderBy: { totalCents: "asc" },
          take: 1,
        },
      },
    });
  }

  const baseDeals = products
    .map((p) => {
      const best = p.offers[0];
      if (!best || best.totalCents > budgetCents) return null;
      const retailer = RETAILER_BY_ID[best.retailerId as keyof typeof RETAILER_BY_ID];
      return {
        product: {
          id: p.id,
          name: p.name,
          setName: p.setName,
          category: p.category,
          msrpCents: p.msrpCents,
        },
        offer: {
          ...best,
          retailerName: retailer?.name ?? best.retailerId,
          observedAt: best.observedAt.toISOString(),
        },
        dealScore: dealScore(best.totalCents, p.msrpCents),
        savingsVsMsrpCents: Math.max(0, p.msrpCents - best.itemPriceCents),
      };
    })
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    await Promise.all(
      baseDeals.map(async (d) => {
        const roiPayload = await buildProductRoiFromCatalog(
          d.product.id,
          d.offer.totalCents,
          d.offer.retailerName,
          d.offer.itemPriceCents,
        );
        return {
          ...d,
          roiPercent: roiPayload?.roi?.roiPercent ?? null,
          breakEvenChancePercent: roiPayload?.roi?.breakEvenChancePercent ?? null,
          expectedNetCents: roiPayload?.roi?.expectedNetCents ?? null,
        };
      }),
    )
  ).sort((a, b) => {
    const aRoi = a.roiPercent ?? Number.NEGATIVE_INFINITY;
    const bRoi = b.roiPercent ?? Number.NEGATIVE_INFINITY;
    if (bRoi !== aRoi) return bRoi - aRoi;
    const aChance = a.breakEvenChancePercent ?? -1;
    const bChance = b.breakEvenChancePercent ?? -1;
    if (bChance !== aChance) return bChance - aChance;
    return b.dealScore - a.dealScore || a.offer.totalCents - b.offer.totalCents;
  });
}

export async function ensureCatalogSeeded() {
  const count = await prisma.product.count();
  if (count > 0) return;

  for (const p of SEALED_CATALOG) {
    await prisma.product.create({
      data: {
        id: p.id,
        name: p.name,
        setName: p.setName,
        category: p.category,
        msrpCents: p.msrpCents,
        imageUrl: p.imageUrl ?? null,
        searchText: productSearchText(p),
      },
    });
    await refreshProductOffers(p.id);
  }
}
