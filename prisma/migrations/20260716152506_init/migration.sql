-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "amountCents" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "WatcherState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'preorder',
    "lastPolledAt" DATETIME,
    "nextPollAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "message" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Offer_productId_totalCents_idx" ON "Offer"("productId", "totalCents");

-- CreateIndex
CREATE INDEX "Offer_retailerId_idx" ON "Offer"("retailerId");

-- CreateIndex
CREATE INDEX "PreorderEvent_createdAt_idx" ON "PreorderEvent"("createdAt");
