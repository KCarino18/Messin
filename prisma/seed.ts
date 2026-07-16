import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  SEALED_CATALOG,
  preorderCatalog,
  productSearchText,
} from "../src/lib/catalog/products";
import { buildDemoOffers } from "../src/lib/retailers/demoOffers";
import { scoreOffer } from "../src/lib/retailers/scorer";
import { estimateTaxCents } from "../src/lib/money";
import { retailerProductSearchUrl } from "../src/lib/retailers/urls";
import type { RetailerId } from "../src/lib/retailers/allowlist";
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
  const radar = preorderCatalog();
  const retailers: RetailerId[] = [
    "gamenerdz",
    "card_kingdom",
    "amazon",
    "target",
    "starcitygames",
  ];

  for (const [index, seed] of radar.slice(0, 6).entries()) {
    const retailerId = retailers[index % retailers.length];
    const shippingCents =
      retailerId === "amazon" || retailerId === "target" ? 0 : 299;
    const taxCents = estimateTaxCents(seed.msrpCents, shippingCents);
    await prisma.preorderEvent.create({
      data: {
        productId: seed.id,
        productName: seed.name,
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
        url: retailerProductSearchUrl(retailerId, seed.name),
        eventType: "went_live",
        isDemo: true,
        createdAt: new Date(now - (6 + index * 5) * 60_000),
      },
    });
  }

  await prisma.watcherState.create({
    data: {
      id: "preorder",
      status: "watching",
      message: "Seeded — new & unreleased sealed only",
      lastPolledAt: new Date(now - 15_000),
      nextPollAt: new Date(now + 45_000),
    },
  });

  console.log(
    `Seeded ${SEALED_CATALOG.length} sealed products; radar eligible: ${radar.length}`,
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
