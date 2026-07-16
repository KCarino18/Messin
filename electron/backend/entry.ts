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
}) {
  const { dbPath, templateDbPath, pollMs = 60_000 } = options;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath) && fs.existsSync(templateDbPath)) {
    fs.copyFileSync(templateDbPath, dbPath);
  }

  prisma = createPrisma(dbPath);
  // Packaged upgrades keep the old userData DB; apply missing columns before any ORM reads.
  await ensureSchema();
  await syncCatalog();
  await ensureBudget();
  await resetPreorderEventsForRadar();
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

  // Retired mistaken SKU name — collectors are Displays, not Boxes.
  await db().$executeRawUnsafe(
    `UPDATE "Product" SET "sealedType" = 'collector_booster_display' WHERE "sealedType" = 'collector_booster_box'`,
  );
  await db().$executeRawUnsafe(
    `UPDATE "PreorderEvent" SET "sealedType" = 'collector_booster_display' WHERE "sealedType" = 'collector_booster_box'`,
  );
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
    // Quick live refresh (TCGPlayer + Card Kingdom). Deep web search runs on demand.
    await refreshOffers(p.id, { deep: false });
  }
}

async function ensureBudget() {
  await db().budget.upsert({
    where: { id: "default" },
    create: { id: "default", amountCents: 15000 },
    update: {},
  });
}

async function refreshOffers(
  productId: string,
  options: { deep?: boolean } = {},
) {
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) return [];
  const catalog = catalogById(productId);
  const sealedType =
    normalizeSealedType(product.sealedType) ??
    (product.sealedType as SealedTypeId);
  const seed: ProductSeed = {
    id: product.id,
    name: product.name,
    setName: product.setName,
    category: product.category as ProductSeed["category"],
    sealedType,
    releaseDate: product.releaseDate,
    msrpCents: product.msrpCents,
    tcgplayerGroupId: catalog?.tcgplayerGroupId,
    tcgplayerProductId: catalog?.tcgplayerProductId,
  };
  const { offers, mode } = await fetchOffersForProduct(seed, {
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
  return db().offer.findMany({
    where: { productId, rejected: false, inStock: true },
    orderBy: { totalCents: "asc" },
  });
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

  let products = await db().product.findMany({
    where,
    include: {
      offers: {
        where: { rejected: false, inStock: true },
        orderBy: { totalCents: "asc" },
        take: 1,
      },
    },
  });

  // Fill gaps with a deep web search; catalog sync already stored TCGPlayer + Card Kingdom.
  const missing = products.filter((x) => x.offers.length === 0).map((p) => p.id);
  for (let i = 0; i < missing.length; i += 3) {
    await Promise.all(
      missing.slice(i, i + 3).map((id) => refreshOffers(id, { deep: true })),
    );
  }

  // Opportunistically deepen a few visible products each load (real store pages).
  const deepen = products
    .filter((p) => p.offers.length > 0)
    .slice(0, 4)
    .map((p) => p.id);
  for (let i = 0; i < deepen.length; i += 2) {
    await Promise.all(
      deepen.slice(i, i + 2).map((id) => refreshOffers(id, { deep: true })),
    );
  }

  products = await db().product.findMany({
    where,
    include: {
      offers: {
        where: { rejected: false, inStock: true },
        orderBy: { totalCents: "asc" },
        take: 1,
      },
    },
  });

  const deals = products
    .map((p) => {
      const best = p.offers[0];
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
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .sort((a, b) => b.dealScore - a.dealScore || a.offer.totalCents - b.offer.totalCents);

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
  const offers = await refreshOffers(productId, { deep: true });
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const visible = offers.filter((o) => !o.rejected && o.inStock);
  return {
    product,
    offers: visible.map(enrichOffer),
    best: visible[0] ? enrichOffer(visible[0]) : null,
    mode: visible.some((o) => o.isDemo) ? "demo" : "live",
  };
}

function radarTargets() {
  return preorderCatalog();
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

  if ((await db().preorderEvent.count()) > 0) return;

  const now = Date.now();
  let i = 0;
  // Seed radar with live hits from Amazon / GameNerdz / Forge & Fire / Flipside.
  for (const seed of eligible.slice(0, 4)) {
    for (const retailerId of PREORDER_WATCH_RETAILERS) {
      const live = await liveOfferForRetailer(seed, retailerId);
      if (!live) continue;
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
          createdAt: new Date(now - (8 + i * 5) * 60_000),
        },
      });
      i += 1;
      if (i >= 8) break;
    }
    if (i >= 8) break;
  }

  // Fallback: at least one TCGPlayer/market event so the rail isn't empty.
  if ((await db().preorderEvent.count()) === 0) {
    for (const seed of eligible.slice(0, 3)) {
      const live = await liveStreetPrice(seed);
      if (!live) continue;
      const taxCents = estimateTaxCents(live.itemPriceCents, live.shippingCents);
      await db().preorderEvent.create({
        data: {
          productId: seed.id,
          productName: seed.name,
          sealedType: seed.sealedType,
          setName: seed.setName,
          releaseDate: seed.releaseDate,
          retailerId: live.retailerId,
          priceCents: live.itemPriceCents,
          shippingCents: live.shippingCents,
          taxCents,
          totalCents: live.itemPriceCents + live.shippingCents + taxCents,
          msrpCents: seed.msrpCents,
          isMsrp: live.itemPriceCents <= seed.msrpCents,
          url: live.url,
          eventType: "went_live",
          isDemo: false,
          createdAt: new Date(now - 10 * 60_000),
        },
      });
    }
  }
}

async function pollPreorders(pollMs: number) {
  if (!prisma) return;
  const targets = radarTargets();
  if (targets.length === 0) return;

  tick += 1;
  const now = new Date();
  const next = new Date(now.getTime() + pollMs);
  const target = targets[tick % targets.length];
  const retailerId =
    PREORDER_WATCH_RETAILERS[tick % PREORDER_WATCH_RETAILERS.length]!;

  const live = await liveOfferForRetailer(target, retailerId);
  if (!prisma) return;
  // Skip ticks with no real listing — never invent a preorder price.
  if (!live) {
    await db().watcherState.upsert({
      where: { id: "preorder" },
      create: {
        id: "preorder",
        status: "watching",
        lastPolledAt: now,
        nextPollAt: next,
        message: `No live ${RETAILER_BY_ID[retailerId].name} listing for ${target.name}`,
      },
      update: {
        status: "watching",
        lastPolledAt: now,
        nextPollAt: next,
        message: `No live ${RETAILER_BY_ID[retailerId].name} listing for ${target.name}`,
      },
    });
    return;
  }

  const itemPriceCents = live.itemPriceCents;
  const shippingCents = live.shippingCents;
  const taxCents = estimateTaxCents(itemPriceCents, shippingCents);
  const totalCents = itemPriceCents + shippingCents + taxCents;
  const productUrl = live.url;

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
      url: productUrl,
      eventType,
      isDemo: false,
    },
  });

  await db().watcherState.upsert({
    where: { id: "preorder" },
    create: {
      id: "preorder",
      status: "watching",
      lastPolledAt: now,
      nextPollAt: next,
      message:
        "Watching Amazon, GameNerdz, Forge & Fire, Flipside for new/unreleased sealed",
    },
    update: {
      status: "watching",
      lastPolledAt: now,
      nextPollAt: next,
      message:
        "Watching Amazon, GameNerdz, Forge & Fire, Flipside for new/unreleased sealed",
    },
  });

  const payload = {
    type: "preorder",
    event: {
      ...event,
      createdAt: event.createdAt.toISOString(),
      releaseBucket: releaseBucket(target.releaseDate, now),
      retailerName:
        RETAILER_ALLOWLIST.find((r) => r.id === retailerId)?.name ?? retailerId,
    },
    watcher: {
      lastPolledAt: now.toISOString(),
      nextPollAt: next.toISOString(),
      pollMs,
      status: "watching",
    },
  };

  for (const listener of listeners) listener(payload);
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
    events: events.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
      releaseBucket: releaseBucket(e.releaseDate),
      retailerName:
        RETAILER_ALLOWLIST.find((r) => r.id === e.retailerId)?.name ?? e.retailerId,
    })),
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
