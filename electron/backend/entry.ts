import path from "node:path";
import fs from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  SEALED_CATALOG,
  catalogById,
  preorderCatalog,
  productSearchText,
} from "../../src/lib/catalog/products";
import {
  PREORDER_WATCH_RETAILERS,
  RETAILER_ALLOWLIST,
  RETAILER_BY_ID,
  type RetailerId,
} from "../../src/lib/retailers/allowlist";
import { fetchOffersForProduct } from "../../src/lib/retailers/adapters";
import { fetchPreorderWatchOffers } from "../../src/lib/retailers/fetchers/preorderRetailers";
import type { BlockedRetailer } from "../../src/lib/retailers/blocked";
import { setBrowserFetch, type PageFetchResult } from "../../src/lib/retailers/http";
import { dealScore, scoreOffer } from "../../src/lib/retailers/scorer";
import {
  estimateTcgShippingCents,
  fetchTcgPlayerPriceInGroup,
} from "../../src/lib/retailers/tcgcsv";
import { estimateTaxCents } from "../../src/lib/money";
import {
  normalizeSealedType,
  releaseBucket,
  type SealedTypeId,
} from "../../src/lib/sealedTypes";
import type { ProductSeed } from "../../src/lib/retailers/types";
import { buildProductRoiFromCatalog } from "../../src/lib/roi/service";
import {
  credentialsFromDbRow,
  normalizeSettingsPatch,
  setApiCredentials,
  toPublicSettings,
  type ApiSettingsPatch,
} from "../../src/lib/settings/apiCredentials";

let prisma: PrismaClient | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let tick = 0;
const listeners = new Set<(payload: unknown) => void>();

function createPrisma(dbPath: string) {
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export async function initBackend(options: {
  dbPath: string;
  templateDbPath: string;
  pollMs?: number;
  browserFetch?: (url: string) => Promise<PageFetchResult>;
}) {
  const { dbPath, templateDbPath, pollMs = 60_000, browserFetch } = options;
  if (browserFetch) setBrowserFetch(browserFetch);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath) && fs.existsSync(templateDbPath)) {
    fs.copyFileSync(templateDbPath, dbPath);
  }

  prisma = createPrisma(dbPath);
  // Packaged upgrades keep the old userData DB; apply missing columns before any ORM reads.
  await ensureSchema();
  await ensureAppSettingsTable();
  await syncCatalog();
  await ensureBudget();
  await loadApiCredentialsFromDb();
  // Purge stale radar rows quickly; fill live listings in the background.
  void resetPreorderEventsForRadar();
  startWatcher(pollMs);
  return { ok: true as const };
}

async function tableColumns(table: string): Promise<Set<string>> {
  const rows = await db().$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${table}")`,
  );
  return new Set(rows.map((row) => row.name));
}

async function ensureColumn(
  table: string,
  column: string,
  ddl: string,
  existing: Set<string>,
) {
  if (existing.has(column)) return;
  await db().$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
  existing.add(column);
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await db().$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
  );
  return rows.length > 0;
}

async function bootstrapSchemaIfNeeded() {
  if (await tableExists("Product")) return;

  const statements = [
    `CREATE TABLE "Product" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "setName" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "sealedType" TEXT NOT NULL DEFAULT 'play_booster_box',
      "releaseDate" TEXT NOT NULL DEFAULT '2020-01-01',
      "msrpCents" INTEGER NOT NULL,
      "imageUrl" TEXT,
      "searchText" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE "Offer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "retailerId" TEXT NOT NULL,
      "sellerName" TEXT NOT NULL,
      "itemPriceCents" INTEGER NOT NULL,
      "shippingCents" INTEGER NOT NULL,
      "taxCents" INTEGER NOT NULL,
      "totalCents" INTEGER NOT NULL,
      "url" TEXT NOT NULL,
      "inStock" BOOLEAN NOT NULL DEFAULT true,
      "isPreorder" BOOLEAN NOT NULL DEFAULT false,
      "isDemo" BOOLEAN NOT NULL DEFAULT false,
      "rejected" BOOLEAN NOT NULL DEFAULT false,
      "rejectReason" TEXT,
      "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE "Budget" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
      "amountCents" INTEGER NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE "PreorderEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT,
      "productName" TEXT NOT NULL,
      "sealedType" TEXT NOT NULL DEFAULT 'play_booster_box',
      "setName" TEXT NOT NULL DEFAULT '',
      "releaseDate" TEXT NOT NULL DEFAULT '2020-01-01',
      "retailerId" TEXT NOT NULL,
      "priceCents" INTEGER NOT NULL,
      "shippingCents" INTEGER NOT NULL,
      "taxCents" INTEGER NOT NULL,
      "totalCents" INTEGER NOT NULL,
      "msrpCents" INTEGER,
      "isMsrp" BOOLEAN NOT NULL DEFAULT false,
      "url" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "isDemo" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PreorderEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE "WatcherState" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'preorder',
      "lastPolledAt" DATETIME,
      "nextPollAt" DATETIME,
      "status" TEXT NOT NULL DEFAULT 'idle',
      "message" TEXT,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE INDEX "Offer_productId_totalCents_idx" ON "Offer"("productId", "totalCents")`,
    `CREATE INDEX "Offer_retailerId_idx" ON "Offer"("retailerId")`,
    `CREATE INDEX "PreorderEvent_createdAt_idx" ON "PreorderEvent"("createdAt")`,
  ];

  for (const sql of statements) {
    await db().$executeRawUnsafe(sql);
  }
}

/** Bring older install DBs up to the current Prisma schema without wiping userData. */
async function ensureSchema() {
  await bootstrapSchemaIfNeeded();

  const productCols = await tableColumns("Product");
  await ensureColumn(
    "Product",
    "sealedType",
    `"sealedType" TEXT NOT NULL DEFAULT 'play_booster_box'`,
    productCols,
  );
  await ensureColumn(
    "Product",
    "releaseDate",
    `"releaseDate" TEXT NOT NULL DEFAULT '2020-01-01'`,
    productCols,
  );

  const preorderCols = await tableColumns("PreorderEvent");
  await ensureColumn(
    "PreorderEvent",
    "sealedType",
    `"sealedType" TEXT NOT NULL DEFAULT 'play_booster_box'`,
    preorderCols,
  );
  await ensureColumn(
    "PreorderEvent",
    "setName",
    `"setName" TEXT NOT NULL DEFAULT ''`,
    preorderCols,
  );
  await ensureColumn(
    "PreorderEvent",
    "releaseDate",
    `"releaseDate" TEXT NOT NULL DEFAULT '2020-01-01'`,
    preorderCols,
  );

  await db().$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Product_sealedType_idx" ON "Product"("sealedType")`,
  );
  await db().$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Product_releaseDate_idx" ON "Product"("releaseDate")`,
  );
  await db().$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PreorderEvent_sealedType_idx" ON "PreorderEvent"("sealedType")`,
  );

  await ensureAppSettingsTable();

  // Retired mistaken SKU name — collectors are Displays, not Boxes.
  await db().$executeRawUnsafe(
    `UPDATE "Product" SET "sealedType" = 'collector_booster_display' WHERE "sealedType" = 'collector_booster_box'`,
  );
  await db().$executeRawUnsafe(
    `UPDATE "PreorderEvent" SET "sealedType" = 'collector_booster_display' WHERE "sealedType" = 'collector_booster_box'`,
  );
}

async function ensureAppSettingsTable() {
  if (await tableExists("AppSettings")) return;
  await db().$executeRawUnsafe(
    `CREATE TABLE "AppSettings" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
      "amazonAccessKey" TEXT,
      "amazonSecretKey" TEXT,
      "amazonPartnerTag" TEXT,
      "amazonMarketplace" TEXT DEFAULT 'www.amazon.com',
      "walmartConsumerId" TEXT,
      "walmartPrivateKey" TEXT,
      "walmartKeyVersion" TEXT DEFAULT '1',
      "walmartPublisherId" TEXT,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );
}

async function loadApiCredentialsFromDb() {
  try {
    const row = await db().appSettings.findUnique({ where: { id: "default" } });
    setApiCredentials(credentialsFromDbRow(row));
  } catch (error) {
    console.error("Failed to load API credentials; continuing without official APIs", error);
    setApiCredentials(credentialsFromDbRow(null));
  }
}

function db() {
  if (!prisma) throw new Error("Backend not initialized");
  return prisma;
}

async function syncCatalog() {
  const keepIds = new Set(SEALED_CATALOG.map((p) => p.id));
  const existing = await db().product.findMany({ select: { id: true } });
  for (const row of existing) {
    if (!keepIds.has(row.id)) {
      await db().product.delete({ where: { id: row.id } });
    }
  }

  for (const p of SEALED_CATALOG) {
    await db().product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        setName: p.setName,
        category: p.category,
        sealedType: p.sealedType,
        releaseDate: p.releaseDate,
        msrpCents: p.msrpCents,
        searchText: productSearchText(p),
      },
      update: {
        name: p.name,
        setName: p.setName,
        category: p.category,
        sealedType: p.sealedType,
        releaseDate: p.releaseDate,
        msrpCents: p.msrpCents,
        searchText: productSearchText(p),
      },
    });
  }

  // Refresh live prices in the background so startup is not blocked on network calls.
  void (async () => {
    for (const p of SEALED_CATALOG) {
      try {
        await refreshOffers(p.id, { deep: false });
      } catch (error) {
        console.error("Background catalog refresh failed", p.id, error);
      }
    }
  })();
}

async function ensureBudget() {
  await db().budget.upsert({
    where: { id: "default" },
    create: { id: "default", amountCents: 15000 },
    update: {},
  });
}

function offerIsVisible(o: { rejected: boolean; inStock: boolean; isPreorder: boolean }) {
  return !o.rejected && (o.inStock || o.isPreorder);
}

function productSeedFromDb(product: {
  id: string;
  name: string;
  setName: string;
  category: string;
  sealedType: string;
  releaseDate: string;
  msrpCents: number;
}): ProductSeed {
  const catalog = catalogById(product.id);
  const sealedType =
    normalizeSealedType(product.sealedType) ??
    (product.sealedType as SealedTypeId);
  return {
    id: product.id,
    name: product.name,
    setName: product.setName,
    category: product.category as ProductSeed["category"],
    sealedType,
    releaseDate: catalog?.releaseDate ?? product.releaseDate,
    msrpCents: product.msrpCents,
    packCount: catalog?.packCount,
    tcgplayerGroupId: catalog?.tcgplayerGroupId,
    tcgplayerProductId: catalog?.tcgplayerProductId,
    listingUrls: catalog?.listingUrls,
  };
}

async function refreshOffers(
  productId: string,
  options: { deep?: boolean } = {},
) {
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) return { offers: [], blockedRetailers: [] as BlockedRetailer[] };
  const seed = productSeedFromDb(product);
  const { offers, mode, blockedRetailers } = await fetchOffersForProduct(seed, {
    deep: options.deep ?? true,
  });
  const scored = offers.map((o) => scoreOffer(o, product.msrpCents));
  await db().offer.deleteMany({ where: { productId } });
  await db().offer.createMany({
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
  const stored = await db().offer.findMany({ where: { productId } });
  const visible = stored.filter(offerIsVisible).sort((a, b) => a.totalCents - b.totalCents);
  return { offers: visible, blockedRetailers };
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
  return {
    ...o,
    retailerName: RETAILER_BY_ID[o.retailerId as keyof typeof RETAILER_BY_ID]?.name ?? o.retailerId,
    observedAt: o.observedAt.toISOString(),
  };
}

export async function getBudget() {
  const budget = await db().budget.findUnique({ where: { id: "default" } });
  return { amountCents: budget?.amountCents ?? 15000 };
}

export async function setBudget(amountCents: number) {
  const budget = await db().budget.upsert({
    where: { id: "default" },
    create: { id: "default", amountCents },
    update: { amountCents },
  });
  return { amountCents: budget.amountCents };
}

export async function getApiSettings() {
  const row = await db().appSettings.findUnique({ where: { id: "default" } });
  return toPublicSettings(row);
}

export async function setApiSettings(patch: ApiSettingsPatch) {
  const normalized = normalizeSettingsPatch(patch);
  const row = await db().appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      amazonAccessKey: normalized.amazonAccessKey ?? null,
      amazonSecretKey: normalized.amazonSecretKey ?? null,
      amazonPartnerTag: normalized.amazonPartnerTag ?? null,
      amazonMarketplace: normalized.amazonMarketplace ?? "www.amazon.com",
      walmartConsumerId: normalized.walmartConsumerId ?? null,
      walmartPrivateKey: normalized.walmartPrivateKey ?? null,
      walmartKeyVersion: normalized.walmartKeyVersion ?? "1",
      walmartPublisherId: normalized.walmartPublisherId ?? null,
    },
    update: {
      ...(normalized.amazonAccessKey !== undefined
        ? { amazonAccessKey: normalized.amazonAccessKey }
        : {}),
      ...(normalized.amazonSecretKey !== undefined
        ? { amazonSecretKey: normalized.amazonSecretKey }
        : {}),
      ...(normalized.amazonPartnerTag !== undefined
        ? { amazonPartnerTag: normalized.amazonPartnerTag }
        : {}),
      ...(normalized.amazonMarketplace !== undefined
        ? { amazonMarketplace: normalized.amazonMarketplace }
        : {}),
      ...(normalized.walmartConsumerId !== undefined
        ? { walmartConsumerId: normalized.walmartConsumerId }
        : {}),
      ...(normalized.walmartPrivateKey !== undefined
        ? { walmartPrivateKey: normalized.walmartPrivateKey }
        : {}),
      ...(normalized.walmartKeyVersion !== undefined
        ? { walmartKeyVersion: normalized.walmartKeyVersion }
        : {}),
      ...(normalized.walmartPublisherId !== undefined
        ? { walmartPublisherId: normalized.walmartPublisherId }
        : {}),
    },
  });
  setApiCredentials(credentialsFromDbRow(row));
  return toPublicSettings(row);
}

export async function getDeals(budgetCents: number, sealedTypes: string[] = []) {
  const normalizedTypes = [
    ...new Set(
      sealedTypes
        .map((t) => normalizeSealedType(t))
        .filter((t): t is SealedTypeId => Boolean(t)),
    ),
  ];
  if (normalizedTypes.length === 0) {
    return { budgetCents, sealedTypes: normalizedTypes, deals: [], mode: "live" as const };
  }

  const where = { sealedType: { in: normalizedTypes } };

  const productRows = await db().product.findMany({ where, select: { id: true } });
  const productIds = productRows.map((p) => p.id);

  // Deep refresh every matching SKU so deals aren't stuck on TCGPlayer-only cache.
  for (let i = 0; i < productIds.length; i += 4) {
    await Promise.all(
      productIds.slice(i, i + 4).map((id) => refreshOffers(id, { deep: true })),
    );
  }

  const products = await db().product.findMany({
    where,
    include: { offers: true },
  });

  const baseDeals = products
    .map((p) => {
      const visible = p.offers.filter(offerIsVisible).sort((a, b) => a.totalCents - b.totalCents);
      const best = visible[0];
      if (!best || best.totalCents > budgetCents) return null;
      return {
        product: {
          id: p.id,
          name: p.name,
          setName: p.setName,
          category: p.category,
          sealedType: p.sealedType,
          releaseDate: p.releaseDate,
          msrpCents: p.msrpCents,
        },
        offer: enrichOffer(best),
        dealScore: dealScore(best.totalCents, p.msrpCents),
        savingsVsMsrpCents: Math.max(0, p.msrpCents - best.itemPriceCents),
      };
    })
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  // Rip-focused ranking: attach EV ROI for each under-budget listing, then sort by it.
  const deals = (
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

  return {
    budgetCents,
    sealedTypes: normalizedTypes,
    deals,
    mode: deals.some((d) => d.offer.isDemo) ? "demo" : "live",
  };
}

async function liveStreetPrice(seed: ProductSeed): Promise<{
  itemPriceCents: number;
  shippingCents: number;
  url: string;
  isDemo: boolean;
  retailerId: RetailerId;
} | null> {
  // Prefer dedicated preorder watch stores (Amazon, GameNerdz, Forge & Fire, Flipside).
  try {
    const watch = await fetchPreorderWatchOffers(seed);
    const scored = watch
      .map((o) => scoreOffer(o, seed.msrpCents))
      .filter((o) => !o.rejected && (o.inStock || o.isPreorder))
      .sort((a, b) => a.totalCents - b.totalCents);
    const best = scored[0];
    if (best) {
      return {
        itemPriceCents: best.itemPriceCents,
        shippingCents: best.shippingCents,
        url: best.url,
        isDemo: false,
        retailerId: best.retailerId,
      };
    }
  } catch {
    // fall through to TCGPlayer market
  }

  if (!seed.tcgplayerGroupId || !seed.tcgplayerProductId) return null;
  try {
    const price = await fetchTcgPlayerPriceInGroup(
      seed.tcgplayerGroupId,
      seed.tcgplayerProductId,
    );
    const item = price?.lowPriceCents ?? price?.marketPriceCents;
    if (!price || item == null || item <= 0) return null;
    return {
      itemPriceCents: item,
      shippingCents: estimateTcgShippingCents(item),
      url: price.url || `https://www.tcgplayer.com/product/${seed.tcgplayerProductId}`,
      isDemo: false,
      retailerId: "tcgplayer",
    };
  } catch {
    return null;
  }
}

async function liveOfferForRetailer(
  seed: ProductSeed,
  retailerId: RetailerId,
): Promise<{
  itemPriceCents: number;
  shippingCents: number;
  url: string;
  isDemo: boolean;
  isPreorder: boolean;
} | null> {
  try {
    const offers = await fetchPreorderWatchOffers(seed, retailerId);
    const scored = offers
      .map((o) => scoreOffer(o, seed.msrpCents))
      .filter((o) => !o.rejected && (o.inStock || o.isPreorder))
      .sort((a, b) => a.totalCents - b.totalCents);
    const best = scored[0];
    if (!best) return null;
    return {
      itemPriceCents: best.itemPriceCents,
      shippingCents: best.shippingCents,
      url: best.url,
      isDemo: false,
      isPreorder: best.isPreorder,
    };
  } catch {
    return null;
  }
}

export async function searchProducts(q: string) {
  const query = q.trim().toLowerCase();
  const products = !query
    ? await db().product.findMany({ orderBy: { name: "asc" }, take: 24 })
    : await db().product.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { setName: { contains: query } },
            { searchText: { contains: query } },
            { category: { contains: query } },
            { sealedType: { contains: query } },
          ],
        },
        orderBy: { name: "asc" },
        take: 24,
      });
  return { products };
}

export async function getOffers(productId: string) {
  const { offers, blockedRetailers } = await refreshOffers(productId, { deep: true });
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) return null;
  return {
    product,
    offers: offers.map(enrichOffer),
    best: offers[0] ? enrichOffer(offers[0]) : null,
    mode: offers.some((o) => o.isDemo) ? "demo" : "live",
    blockedRetailers,
  };
}

/** Buy-price vs simulated singles EV / break-even chance for a sealed SKU. */
export async function getProductRoi(productId: string) {
  const { offers } = await refreshOffers(productId, { deep: true });
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const usable = offers
    .filter((o) => !o.rejected && (o.inStock || o.isPreorder))
    .sort((a, b) => a.totalCents - b.totalCents);
  const best = usable[0];
  const buyPriceCents = best?.totalCents ?? 0;
  const itemPriceCents = best?.itemPriceCents ?? buyPriceCents;
  const buyLabel = best
    ? `${RETAILER_BY_ID[best.retailerId as RetailerId]?.name ?? best.retailerId}`
    : "no live listing";

  return buildProductRoiFromCatalog(
    productId,
    buyPriceCents,
    buyLabel,
    itemPriceCents,
  );
}

function radarTargets() {
  return preorderCatalog();
}

/** Fast dedicated stores for first paint; broader watch list fills via poll. */
const RADAR_SEED_RETAILERS: RetailerId[] = [
  "flipside_gaming",
  "forge_and_fire",
  "gamenerdz",
  "card_kingdom",
  "starcitygames",
  "miniature_market",
  "coolstuffinc",
  "cardhaus",
  "abu_games",
  "amazon",
  "target",
  "walmart",
  "game_stop",
  "best_buy",
];

async function upsertRadarLive(
  seed: ProductSeed,
  retailerId: RetailerId,
  live: {
    itemPriceCents: number;
    shippingCents: number;
    url: string;
    isDemo: boolean;
  },
  createdAt: Date,
) {
  const existing = await db().preorderEvent.findFirst({
    where: { productId: seed.id, retailerId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return false;
  const taxCents = estimateTaxCents(live.itemPriceCents, live.shippingCents);
  await db().preorderEvent.create({
    data: {
      productId: seed.id,
      productName: seed.name,
      sealedType: seed.sealedType,
      setName: seed.setName,
      releaseDate: seed.releaseDate,
      retailerId,
      priceCents: live.itemPriceCents,
      shippingCents: live.shippingCents,
      taxCents,
      totalCents: live.itemPriceCents + live.shippingCents + taxCents,
      msrpCents: seed.msrpCents,
      isMsrp: live.itemPriceCents <= seed.msrpCents,
      url: live.url,
      eventType: "went_live",
      isDemo: false,
      createdAt,
    },
  });
  return true;
}

async function enrichRadarFromLive(eligible: ProductSeed[]) {
  const now = Date.now();
  let added = 0;

  for (const seed of eligible) {
    const retailers = [...new Set([...RADAR_SEED_RETAILERS, ...PREORDER_WATCH_RETAILERS])];
    for (let i = 0; i < retailers.length; i += 5) {
      const batch = retailers.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (retailerId) => {
          const live = await liveOfferForRetailer(seed, retailerId);
          if (!live) return null;
          return { retailerId, live };
        }),
      );
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const ok = await upsertRadarLive(
          seed,
          result.value.retailerId,
          result.value.live,
          new Date(now - (8 + added * 2) * 60_000),
        );
        if (ok) added += 1;
      }
    }
  }

  return added;
}

async function resetPreorderEventsForRadar() {
  const eligible = preorderCatalog();
  const eligibleIds = new Set(eligible.map((p) => p.id));
  await db().preorderEvent.deleteMany({
    where: {
      OR: [
        { productId: null },
        { productId: { notIn: [...eligibleIds] } },
        { isDemo: true },
      ],
    },
  });

  await enrichRadarFromLive(eligible.slice(0, 10));

  // Fallback: at least one TCGPlayer/market event so the rail isn't empty.
  if ((await db().preorderEvent.count()) === 0) {
    const now = Date.now();
    for (const seed of eligible.slice(0, 3)) {
      const live = await liveStreetPrice(seed);
      if (!live) continue;
      await upsertRadarLive(
        seed,
        live.retailerId,
        live,
        new Date(now - 10 * 60_000),
      );
    }
  }
}

async function recordPreorderHit(
  target: ProductSeed,
  retailerId: RetailerId,
  live: {
    itemPriceCents: number;
    shippingCents: number;
    url: string;
  },
  now: Date,
) {
  const itemPriceCents = live.itemPriceCents;
  const shippingCents = live.shippingCents;
  const taxCents = estimateTaxCents(itemPriceCents, shippingCents);
  const totalCents = itemPriceCents + shippingCents + taxCents;

  const existing = await db().preorderEvent.findFirst({
    where: { productId: target.id, retailerId },
    orderBy: { createdAt: "desc" },
  });

  const eventType = !existing
    ? "went_live"
    : existing.priceCents !== itemPriceCents
      ? "price_change"
      : "heartbeat";

  const event = await db().preorderEvent.create({
    data: {
      productId: target.id,
      productName: target.name,
      sealedType: target.sealedType,
      setName: target.setName,
      releaseDate: target.releaseDate,
      retailerId,
      priceCents: itemPriceCents,
      shippingCents,
      taxCents,
      totalCents,
      msrpCents: target.msrpCents,
      isMsrp: itemPriceCents <= target.msrpCents,
      url: live.url,
      eventType,
      isDemo: false,
    },
  });

  return {
    type: "preorder" as const,
    event: {
      ...event,
      createdAt: event.createdAt.toISOString(),
      releaseBucket: releaseBucket(target.releaseDate, now),
      retailerName:
        RETAILER_ALLOWLIST.find((r) => r.id === retailerId)?.name ?? retailerId,
    },
  };
}

async function pollPreorders(pollMs: number) {
  if (!prisma) return;
  const targets = radarTargets();
  if (targets.length === 0) return;

  tick += 1;
  const now = new Date();
  const next = new Date(now.getTime() + pollMs);
  const target = targets[tick % targets.length]!;
  const watch = PREORDER_WATCH_RETAILERS;
  const batchSize = 5;
  const start = (tick * batchSize) % watch.length;
  const retailers = Array.from({ length: batchSize }, (_, i) => watch[(start + i) % watch.length]!);

  const hits: Awaited<ReturnType<typeof recordPreorderHit>>[] = [];
  const misses: string[] = [];

  await Promise.all(
    retailers.map(async (retailerId) => {
      const live = await liveOfferForRetailer(target, retailerId);
      if (!live) {
        misses.push(RETAILER_BY_ID[retailerId].name);
        return;
      }
      if (!prisma) return;
      const payload = await recordPreorderHit(target, retailerId, live, now);
      hits.push(payload);
    }),
  );

  if (!prisma) return;

  await db().watcherState.upsert({
    where: { id: "preorder" },
    create: {
      id: "preorder",
      status: "watching",
      lastPolledAt: now,
      nextPollAt: next,
      message:
        hits.length > 0
          ? `Live on ${hits.length} store(s) for ${target.name}`
          : `No live listings (${misses.slice(0, 3).join(", ")}…) for ${target.name}`,
    },
    update: {
      status: "watching",
      lastPolledAt: now,
      nextPollAt: next,
      message:
        hits.length > 0
          ? `Live on ${hits.length} store(s) for ${target.name}`
          : `No live listings (${misses.slice(0, 3).join(", ")}…) for ${target.name}`,
    },
  });

  for (const payload of hits) {
    for (const listener of listeners) {
      listener({
        ...payload,
        watcher: {
          lastPolledAt: now.toISOString(),
          nextPollAt: next.toISOString(),
          pollMs,
          status: "watching",
        },
      });
    }
  }
}

function startWatcher(pollMs: number) {
  if (pollTimer) clearInterval(pollTimer);
  void pollPreorders(pollMs);
  pollTimer = setInterval(() => void pollPreorders(pollMs), pollMs);
}

export function subscribePreorders(listener: (payload: unknown) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getPreorderSnapshot(pollMs = 60_000, sealedTypes: string[] = []) {
  await db().watcherState.upsert({
    where: { id: "preorder" },
    create: { id: "preorder", status: "watching" },
    update: {},
  });
  const watcher = await db().watcherState.findUnique({ where: { id: "preorder" } });
  const eligibleIds = preorderCatalog().map((p) => p.id);
  const normalizedTypes = [
    ...new Set(
      sealedTypes
        .map((t) => normalizeSealedType(t))
        .filter((t): t is SealedTypeId => Boolean(t)),
    ),
  ];

  const events = await db().preorderEvent.findMany({
    where: {
      productId: { in: eligibleIds },
      eventType: { in: ["went_live", "price_change", "live"] },
      ...(normalizedTypes.length > 0 ? { sealedType: { in: normalizedTypes } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return {
    pollMs,
    sealedTypes: normalizedTypes,
    watcher: watcher
      ? {
          lastPolledAt: watcher.lastPolledAt?.toISOString() ?? null,
          nextPollAt: watcher.nextPollAt?.toISOString() ?? null,
          status: watcher.status,
          message: watcher.message,
        }
      : null,
    events: events.map((e) => {
      const seed = e.productId ? catalogById(e.productId) : undefined;
      const releaseDate = seed?.releaseDate ?? e.releaseDate;
      return {
        ...e,
        releaseDate,
        createdAt: e.createdAt.toISOString(),
        releaseBucket: releaseBucket(releaseDate),
        retailerName:
          RETAILER_ALLOWLIST.find((r) => r.id === e.retailerId)?.name ?? e.retailerId,
      };
    }),
  };
}

export async function shutdownBackend() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  listeners.clear();
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
