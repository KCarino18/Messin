import path from "node:path";
import fs from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  SEALED_CATALOG,
  preorderCatalog,
  productSearchText,
} from "../../src/lib/catalog/products";
import { RETAILER_ALLOWLIST, RETAILER_BY_ID } from "../../src/lib/retailers/allowlist";
import { fetchOffersForProduct } from "../../src/lib/retailers/adapters";
import { dealScore, scoreOffer } from "../../src/lib/retailers/scorer";
import { estimateTaxCents } from "../../src/lib/money";
import { retailerProductSearchUrl } from "../../src/lib/retailers/urls";
import { releaseBucket, type SealedTypeId } from "../../src/lib/sealedTypes";
import type { ProductSeed } from "../../src/lib/retailers/types";
import type { RetailerId } from "../../src/lib/retailers/allowlist";

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

/** Bring older install DBs up to the current Prisma schema without wiping userData. */
async function ensureSchema() {
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
    const offerCount = await db().offer.count({ where: { productId: p.id } });
    if (offerCount === 0) {
      await refreshOffers(p.id);
    }
  }
}

async function ensureBudget() {
  await db().budget.upsert({
    where: { id: "default" },
    create: { id: "default", amountCents: 15000 },
    update: {},
  });
}

async function refreshOffers(productId: string) {
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) return [];
  const seed: ProductSeed = {
    id: product.id,
    name: product.name,
    setName: product.setName,
    category: product.category as ProductSeed["category"],
    sealedType: product.sealedType as SealedTypeId,
    releaseDate: product.releaseDate,
    msrpCents: product.msrpCents,
  };
  const { offers, mode } = await fetchOffersForProduct(seed);
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
  if (sealedTypes.length === 0) {
    return { budgetCents, sealedTypes, deals: [], mode: "demo" as const };
  }

  const where = { sealedType: { in: sealedTypes } };

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

  for (const p of products.filter((x) => x.offers.length === 0)) {
    await refreshOffers(p.id);
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
    sealedTypes,
    deals,
    mode: deals.some((d) => d.offer.isDemo) ? "demo" : "live",
  };
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
  let offers = await db().offer.findMany({
    where: { productId, rejected: false, inStock: true },
    orderBy: { totalCents: "asc" },
  });
  if (offers.length === 0) offers = await refreshOffers(productId);
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) return null;
  return {
    product,
    offers: offers.map(enrichOffer),
    best: offers[0] ? enrichOffer(offers[0]) : null,
    mode: offers.some((o) => o.isDemo) ? "demo" : "live",
  };
}

function radarTargets() {
  return preorderCatalog().map((p) => ({
    productId: p.id,
    productName: p.name,
    setName: p.setName,
    sealedType: p.sealedType,
    releaseDate: p.releaseDate,
    msrpCents: p.msrpCents,
    retailers: [
      "card_kingdom",
      "gamenerdz",
      "amazon",
      "target",
      "coolstuffinc",
      "starcitygames",
      "tcgplayer",
    ] as RetailerId[],
  }));
}

async function resetPreorderEventsForRadar() {
  const eligibleIds = new Set(preorderCatalog().map((p) => p.id));
  await db().preorderEvent.deleteMany({
    where: {
      OR: [{ productId: null }, { productId: { notIn: [...eligibleIds] } }],
    },
  });

  if ((await db().preorderEvent.count()) > 0) return;

  const now = Date.now();
  const seeds = radarTargets().slice(0, 4);
  let i = 0;
  for (const seed of seeds) {
    const retailerId = seed.retailers[i % seed.retailers.length];
    const shippingCents =
      retailerId === "amazon" || retailerId === "target" || retailerId === "walmart" ? 0 : 299;
    const taxCents = estimateTaxCents(seed.msrpCents, shippingCents);
    await db().preorderEvent.create({
      data: {
        productId: seed.productId,
        productName: seed.productName,
        sealedType: seed.sealedType,
        setName: seed.setName,
        releaseDate: seed.releaseDate,
        retailerId,
        priceCents: seed.msrpCents,
        shippingCents,
        taxCents,
        totalCents: seed.msrpCents + shippingCents + taxCents,
        msrpCents: seed.msrpCents,
        isMsrp: true,
        url: retailerProductSearchUrl(retailerId, seed.productName),
        eventType: "went_live",
        isDemo: true,
        createdAt: new Date(now - (8 + i * 7) * 60_000),
      },
    });
    i += 1;
  }
}

async function pollPreorders(pollMs: number) {
  const targets = radarTargets();
  if (targets.length === 0) return;

  tick += 1;
  const now = new Date();
  const next = new Date(now.getTime() + pollMs);
  const target = targets[tick % targets.length];
  const retailerId = target.retailers[tick % target.retailers.length];
  const atMsrp = tick % 3 !== 0;
  const itemPriceCents = atMsrp
    ? target.msrpCents
    : Math.round(target.msrpCents * (1.05 + (tick % 5) * 0.02));
  const shippingCents =
    retailerId === "amazon" || retailerId === "target" || retailerId === "walmart" ? 0 : 399;
  const taxCents = estimateTaxCents(itemPriceCents, shippingCents);
  const totalCents = itemPriceCents + shippingCents + taxCents;
  const productUrl = retailerProductSearchUrl(retailerId, target.productName);

  const existing = await db().preorderEvent.findFirst({
    where: { productId: target.productId, retailerId },
    orderBy: { createdAt: "desc" },
  });

  const eventType = !existing
    ? "went_live"
    : existing.priceCents !== itemPriceCents
      ? "price_change"
      : "heartbeat";

  const event = await db().preorderEvent.create({
    data: {
      productId: target.productId,
      productName: target.productName,
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
      isDemo: true,
    },
  });

  await db().watcherState.upsert({
    where: { id: "preorder" },
    create: {
      id: "preorder",
      status: "watching",
      lastPolledAt: now,
      nextPollAt: next,
      message: "Watching new & unreleased sealed",
    },
    update: {
      status: "watching",
      lastPolledAt: now,
      nextPollAt: next,
      message: "Watching new & unreleased sealed",
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

  const events = await db().preorderEvent.findMany({
    where: {
      productId: { in: eligibleIds },
      eventType: { in: ["went_live", "price_change", "live"] },
      ...(sealedTypes.length > 0 ? { sealedType: { in: sealedTypes } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return {
    pollMs,
    sealedTypes,
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
