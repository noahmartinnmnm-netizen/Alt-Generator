-- CreateEnum
CREATE TYPE "CreditUsageStatus" AS ENUM ('RESERVED', 'USED', 'REFUNDED');

-- CreateTable
CREATE TABLE "ShopCredits" (
    "shop" TEXT NOT NULL,
    "totalCredits" INTEGER NOT NULL DEFAULT 30,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopCredits_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "CreditUsage" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "altText" TEXT,
    "status" "CreditUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditUsage_shop_createdAt_idx" ON "CreditUsage"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "CreditUsage_shop_imageId_idx" ON "CreditUsage"("shop", "imageId");
