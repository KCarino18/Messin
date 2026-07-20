-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "amazonAccessKey" TEXT,
    "amazonSecretKey" TEXT,
    "amazonPartnerTag" TEXT,
    "amazonMarketplace" TEXT DEFAULT 'www.amazon.com',
    "walmartConsumerId" TEXT,
    "walmartPrivateKey" TEXT,
    "walmartKeyVersion" TEXT DEFAULT '1',
    "walmartPublisherId" TEXT,
    "updatedAt" DATETIME NOT NULL
);
