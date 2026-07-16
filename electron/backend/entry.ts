import path from "node:path";
import fs from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client";
import { SEALED_CATALOG, productSearchText } from "../../src/lib/catalog/products";
import { RETAILER_ALLOWLIST, RETAILER_BY_ID } from "../../src/lib/retailers/allowlist";
import { fetchOffersForProduct } from "../../src/lib/retailers/adapters";
import { dealScore, scoreOffer } from "../../src/lib/retailers/scorer";
import { estimateTaxCents } from "../../src/lib/money";
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
  await ensureCatalog();
  await ensureBudget();
  await seedPreordersIfEmpty();
  startWatcher(pollMs);
  return { ok: true as const };
}

function db() {
  if (!prisma) throw new Error("Backend not initialized");
  return prisma;
}

async function ensureCatalog() {
  const count = await db().product.count();
  if (count > 0) return;
  for (const p of SEALED_CATALOG) {
    await db().product.create({
      data: {
        id: p.id,
        name: p.name,
        setName: p.setName,
        category: p.category,
        msrpCents: p.msrpCents,
        searchText: productSearchText(p),
      },
    });
    await refreshOffers(p.id);
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

export async function getDeals(budgetCents: number) {
  let products = await db().product.findMany({
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

const PREORDER_TARGETS = [
  {
    productId: "upcoming-edge-of-eternities-play",
    productName: "Edge of Eternities Play Booster Box",
    msrpCents: 14376,
    retailers: ["card_kingdom", "gamenerdz", "amazon", "target"] as const,
  },
  {
    productId: "upcoming-edge-of-eternities-collector",
    productName: "Edge of Eternities Collector Booster Box",
    msrpCents: 28776,
    retailers: ["coolstuffinc", "channel_fireball", "starcitygames"] as const,
  },
  {
    productId: "upcoming-spider-man-play-box",
    productName: "Marvel's Spider-Man Play Booster Box",
    msrpCents: 14376,
    retailers: ["amazon", "walmart", "tcgplayer", "gamenerdz"] as const,
  },
  {
    productId: "upcoming-spider-man-bundle",
    productName: "Marvel's Spider-Man Bundle",
    msrpCents: 4999,
    retailers: ["target", "walmart", "card_kingdom"] as const,
  },
];

async function seedPreordersIfEmpty() {
  if ((await db().preorderEvent.count()) > 0) return;
  const now = Date.now();
  const seeds = [
    {
      productId: "upcoming-edge-of-eternities-play",
      productName: "Edge of Eternities Play Booster Box",
      retailerId: "gamenerdz",
      priceCents: 14376,
      shippingCents: 299,
      msrpCents: 14376,
      minutesAgo: 8,
    },
    {
      productId: "upcoming-spider-man-bundle",
      productName: "Marvel's Spider-Man Bundle",
      retailerId: "target",
      priceCents: 4999,
      shippingCents: 0,
      msrpCents: 4999,
      minutesAgo: 19,
    },
  ];
  for (const seed of seeds) {
    const taxCents = estimateTaxCents(seed.priceCents, seed.shippingCents);
    await db().preorderEvent.create({
      data: {
        productId: seed.productId,
        productName: seed.productName,
        retailerId: seed.retailerId,
        priceCents: seed.priceCents,
        shippingCents: seed.shippingCents,
        taxCents,
        totalCents: seed.priceCents + seed.shippingCents + taxCents,
        msrpCents: seed.msrpCents,
        isMsrp: seed.priceCents <= seed.msrpCents,
        url: "https://www.gamenerdz.com/",
        eventType: "went_live",
        isDemo: true,
        createdAt: new Date(now - seed.minutesAgo * 60_000),
      },
    });
  }
}

async function pollPreorders(pollMs: number) {
  tick += 1;
  const now = new Date();
  const next = new Date(now.getTime() + pollMs);
  const target = PREORDER_TARGETS[tick % PREORDER_TARGETS.length];
  const retailerId = target.retailers[tick % target.retailers.length];
  const atMsrp = tick % 3 !== 0;
  const itemPriceCents = atMsrp
    ? target.msrpCents
    : Math.round(target.msrpCents * (1.05 + (tick % 5) * 0.02));
  const shippingCents =
    retailerId === "amazon" || retailerId === "target" || retailerId === "walmart" ? 0 : 399;
  const taxCents = estimateTaxCents(itemPriceCents, shippingCents);
  const totalCents = itemPriceCents + shippingCents + taxCents;

  const existing = await db().preorderEvent.findFirst({
    where: { productId: target.productId, retailerId, eventType: "live" },
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
      retailerId,
      priceCents: itemPriceCents,
      shippingCents,
      taxCents,
      totalCents,
      msrpCents: target.msrpCents,
      isMsrp: itemPriceCents <= target.msrpCents,
      url: "https://www.cardkingdom.com/",
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
      message: "Watching sealed preorders",
    },
    update: {
      status: "watching",
      lastPolledAt: now,
      nextPollAt: next,
      message: "Watching sealed preorders",
    },
  });

  const payload = {
    type: "preorder",
    event: {
      ...event,
      createdAt: event.createdAt.toISOString(),
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

export async function getPreorderSnapshot(pollMs = 60_000) {
  await db().watcherState.upsert({
    where: { id: "preorder" },
    create: { id: "preorder", status: "watching" },
    update: {},
  });
  const watcher = await db().watcherState.findUnique({ where: { id: "preorder" } });
  const events = await db().preorderEvent.findMany({
    where: { eventType: { in: ["went_live", "price_change", "live"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return {
    pollMs,
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
