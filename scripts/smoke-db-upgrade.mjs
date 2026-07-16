#!/usr/bin/env node
/**
 * Simulates a 0.3.1 user DB (no sealedType) and verifies initBackend migrates it.
 */
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const tmpDir = join(root, ".tmp-upgrade-smoke");
const oldDb = join(tmpDir, "old.db");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const db = new Database(oldDb);
db.exec(`
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "msrpCents" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "searchText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Offer" (
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
);
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "amountCents" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "PreorderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
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
);
CREATE TABLE "WatcherState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'preorder',
    "lastPolledAt" DATETIME,
    "nextPollAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "message" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "Budget" ("id", "amountCents", "updatedAt") VALUES ('default', 20000, CURRENT_TIMESTAMP);
INSERT INTO "Product" ("id", "name", "setName", "category", "msrpCents", "searchText", "createdAt", "updatedAt")
VALUES ('legacy-product', 'Legacy Box', 'Old Set', 'booster_box', 9999, 'legacy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`);
db.close();

execSync("npx prisma generate", { stdio: "inherit", cwd: root });
execSync("node scripts/bundle-electron-backend.mjs", { stdio: "inherit", cwd: root });

const backend = await import(join(root, "electron/backend.dist.cjs"));
await backend.initBackend({
  dbPath: oldDb,
  templateDbPath: join(tmpDir, "missing-template.db"),
  pollMs: 60_000 * 60,
});

const deals = await backend.getDeals(50_000, ["play_booster_box"]);
if (!Array.isArray(deals.deals)) {
  throw new Error("getDeals failed after upgrade");
}

await backend.shutdownBackend();

const check = new Database(oldDb, { readonly: true });
const productCols = check.prepare(`PRAGMA table_info("Product")`).all().map((r) => r.name);
const preorderCols = check.prepare(`PRAGMA table_info("PreorderEvent")`).all().map((r) => r.name);
const budget = check.prepare(`SELECT amountCents FROM Budget WHERE id = 'default'`).get();
const legacyGone = check.prepare(`SELECT id FROM Product WHERE id = 'legacy-product'`).get();
check.close();

const requiredProduct = ["sealedType", "releaseDate"];
const requiredPreorder = ["sealedType", "setName", "releaseDate"];
for (const col of requiredProduct) {
  if (!productCols.includes(col)) throw new Error(`Product missing ${col}`);
}
for (const col of requiredPreorder) {
  if (!preorderCols.includes(col)) throw new Error(`PreorderEvent missing ${col}`);
}
if (budget?.amountCents !== 20000) {
  throw new Error(`Budget not preserved: ${budget?.amountCents}`);
}
if (legacyGone) {
  throw new Error("legacy product should have been removed by catalog sync");
}

console.log(
  `OK: old DB upgraded; budget preserved; ${deals.deals.length} play-booster deals available`,
);
rmSync(tmpDir, { recursive: true, force: true });
