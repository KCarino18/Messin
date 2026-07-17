import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  SEALED_CATALOG,
  preorderCatalog,
  productSearchText,
} from "../src/lib/catalog/products";
import { fetchOffersForProduct } from "../src/lib/retailers/adapters";
import { scoreOffer } from "../src/lib/retailers/scorer";
import {
  estimateTcgShippingCents,
  fetchTcgPlayerPriceInGroup,
} from "../src/lib/retailers/tcgcsv";
import { estimateTaxCents } from "../src/lib/money";
import path from "node:path";

const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const url =
  raw.startsWith("file:") && !path.isAbsolute(raw.slice(5))
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

  // Packaging / CI must stay offline — live scrapes across 50+ stores hang the
  // desktop release build. The installed app refreshes prices at runtime.
  const seedLivePrices = process.env.SEED_LIVE_PRICES === "1";
  let liveCount = 0;
  for (const p of SEALED_CATALOG) {
    await prisma.product.create({
      data: {
        id: p.id,
        name: p.name,
        setName: p.setName,
        category: p.category,
        sealedType: p.sealedType,
        releaseDate: p.releaseDate,
        msrpCents: p.msrpCents,
        searchText: productSearchText(p),
      },
    });

    if (!seedLivePrices) continue;

    const { offers, mode } = await fetchOffersForProduct(p, { deep: false });
    if (mode === "live") liveCount += 1;
    const scored = offers.map((o) => scoreOffer(o, p.msrpCents));
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
        isDemo: mode === "demo" || o.isDemo,
        rejected: o.rejected,
        rejectReason: o.rejectReason,
      })),
    });
  }

  await prisma.budget.create({
    data: { id: "default", amountCents: 15000 },
  });

  const now = Date.now();
  const radar = preorderCatalog();

  for (const [index, seed] of radar.slice(0, 6).entries()) {
    let itemPriceCents = seed.msrpCents;
    let shippingCents = 299;
    let productUrl = `https://www.tcgplayer.com/product/${seed.tcgplayerProductId}`;
    let isDemo = true;
    if (seed.tcgplayerGroupId && seed.tcgplayerProductId) {
      try {
        const price = await fetchTcgPlayerPriceInGroup(
          seed.tcgplayerGroupId,
          seed.tcgplayerProductId,
        );
        const item = price?.lowPriceCents ?? price?.marketPriceCents;
        if (price && item != null && item > 0) {
          itemPriceCents = item;
          shippingCents = estimateTcgShippingCents(item);
          productUrl = price.url;
          isDemo = false;
        }
      } catch {
        // keep MSRP fallback
      }
    }
    const taxCents = estimateTaxCents(itemPriceCents, shippingCents);
    await prisma.preorderEvent.create({
      data: {
        productId: seed.id,
        productName: seed.name,
        sealedType: seed.sealedType,
        setName: seed.setName,
        releaseDate: seed.releaseDate,
        retailerId: "tcgplayer",
        priceCents: itemPriceCents,
        shippingCents,
        taxCents,
        totalCents: itemPriceCents + shippingCents + taxCents,
        msrpCents: seed.msrpCents,
        isMsrp: itemPriceCents <= seed.msrpCents,
        url: productUrl,
        eventType: "went_live",
        isDemo,
        createdAt: new Date(now - (6 + index * 5) * 60_000),
      },
    });
  }

  await prisma.watcherState.create({
    data: {
      id: "preorder",
      status: "watching",
      message: "Seeded — TCGPlayer market prices",
      lastPolledAt: new Date(now - 15_000),
      nextPollAt: new Date(now + 45_000),
    },
  });

  console.log(
    `Seeded ${SEALED_CATALOG.length} sealed products (${
      seedLivePrices ? `${liveCount} live-priced` : "catalog-only, live at runtime"
    }); radar eligible: ${radar.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
