-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PreorderEvent" (
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
);
INSERT INTO "new_PreorderEvent" ("createdAt", "eventType", "id", "isDemo", "isMsrp", "msrpCents", "priceCents", "productId", "productName", "retailerId", "shippingCents", "taxCents", "totalCents", "url") SELECT "createdAt", "eventType", "id", "isDemo", "isMsrp", "msrpCents", "priceCents", "productId", "productName", "retailerId", "shippingCents", "taxCents", "totalCents", "url" FROM "PreorderEvent";
DROP TABLE "PreorderEvent";
ALTER TABLE "new_PreorderEvent" RENAME TO "PreorderEvent";
CREATE INDEX "PreorderEvent_createdAt_idx" ON "PreorderEvent"("createdAt");
CREATE INDEX "PreorderEvent_sealedType_idx" ON "PreorderEvent"("sealedType");
CREATE TABLE "new_Product" (
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
);
INSERT INTO "new_Product" ("category", "createdAt", "id", "imageUrl", "msrpCents", "name", "searchText", "setName", "updatedAt") SELECT "category", "createdAt", "id", "imageUrl", "msrpCents", "name", "searchText", "setName", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_sealedType_idx" ON "Product"("sealedType");
CREATE INDEX "Product_releaseDate_idx" ON "Product"("releaseDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
