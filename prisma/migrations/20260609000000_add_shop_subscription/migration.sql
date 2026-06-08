-- CreateEnum
CREATE TYPE "TokenUsageType" AS ENUM ('IMAGE_ALT_TEXT', 'PRODUCT_SEO');

-- CreateTable
CREATE TABLE "ShopSubscription" (
    "shop" TEXT NOT NULL,
    "planId" TEXT NOT NULL DEFAULT 'free',
    "shopifySubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSubscription_pkey" PRIMARY KEY ("shop")
);

-- AlterTable
ALTER TABLE "CreditUsage" ADD COLUMN "usageType" "TokenUsageType" NOT NULL DEFAULT 'IMAGE_ALT_TEXT';
ALTER TABLE "CreditUsage" ALTER COLUMN "imageId" DROP NOT NULL;
ALTER TABLE "CreditUsage" ALTER COLUMN "imageUrl" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CreditUsage_shop_productId_usageType_idx" ON "CreditUsage"("shop", "productId", "usageType");
