import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { SEALED_CATALOG, productSearchText } from "../src/lib/catalog/products";
import { buildDemoOffers } from "../src/lib/retailers/demoOffers";
import { scoreOffer } from "../src/lib/retailers/scorer";
import { estimateTaxCents } from "../src/lib/money";
import path from "node:path";

const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const url = raw.startsWith("file:") && !path.isAbsolute(raw.slice(5))
  ? `file:${path.join(process.cwd(), raw.slice(5))}`
  : raw;

const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.offer.deleteMany();
  await prisma.preorderEvent.deleteMany();
  await prisma.product.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.watcherState.deleteMany();

  for (const p of SEALED_CATALOG) {
    await prisma.product.create({
      data: {
        id: p.id,
        name: p.name,
        setName: p.setName,
        category: p.category,
        msrpCents: p.msrpCents,
        searchText: productSearchText(p),
      },
    });

    const scored = buildDemoOffers(p).map((o) => scoreOffer(o, p.msrpCents));
    await prisma.offer.createMany({
      data: scored.map((o) => ({
        productId: p.id,
        retailerId: o.retailerId,
        sellerName: o.sellerName,
        itemPriceCents: o.itemPriceCents,
        shippingCents: o.shippingCents,
        taxCents: o.taxCents,
        totalCents: o.totalCents,
        url: o.url,
        inStock: o.inStock,
        isPreorder: o.isPreorder,
        isDemo: true,
        rejected: o.rejected,
        rejectReason: o.rejectReason,
      })),
    });
  }

  await prisma.budget.create({
    data: { id: "default", amountCents: 15000 },
  });

  const now = Date.now();
  const preorders = [
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
    {
      productId: "upcoming-edge-of-eternities-collector",
      productName: "Edge of Eternities Collector Booster Box",
      retailerId: "card_kingdom",
      priceCents: 29999,
      shippingCents: 0,
      msrpCents: 28776,
      minutesAgo: 33,
    },
    {
      productId: "upcoming-spider-man-play-box",
      productName: "Marvel's Spider-Man Play Booster Box",
      retailerId: "amazon",
      priceCents: 14376,
      shippingCents: 0,
      msrpCents: 14376,
      minutesAgo: 47,
    },
  ];

  for (const seed of preorders) {
    const taxCents = estimateTaxCents(seed.priceCents, seed.shippingCents);
    await prisma.preorderEvent.create({
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
        url: `https://example.com/preorder/${seed.productId}/${seed.retailerId}`,
        eventType: "went_live",
        isDemo: true,
        createdAt: new Date(now - seed.minutesAgo * 60_000),
      },
    });
  }

  await prisma.watcherState.create({
    data: {
      id: "preorder",
      status: "watching",
      message: "Seeded — waiting for first live poll",
      lastPolledAt: new Date(now - 15_000),
      nextPollAt: new Date(now + 45_000),
    },
  });

  console.log(`Seeded ${SEALED_CATALOG.length} sealed products + preorder radar events`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
