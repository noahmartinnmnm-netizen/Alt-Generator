-- CreateEnum
CREATE TYPE "SeoChangeType" AS ENUM ('IMAGE_ALT_TEXT', 'PRODUCT_SEO');

-- CreateEnum
CREATE TYPE "SeoChangeStatus" AS ENUM ('SUGGESTED', 'APPLIED', 'REJECTED', 'FAILED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "SeoChangeHistory" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageId" TEXT,
    "imageUrl" TEXT,
    "changeType" "SeoChangeType" NOT NULL,
    "previousAltText" TEXT,
    "suggestedAltText" TEXT,
    "appliedAltText" TEXT,
    "previousSeoTitle" TEXT,
    "previousSeoDescription" TEXT,
    "suggestedSeoTitle" TEXT,
    "suggestedSeoDescription" TEXT,
    "appliedSeoTitle" TEXT,
    "appliedSeoDescription" TEXT,
    "status" "SeoChangeStatus" NOT NULL DEFAULT 'SUGGESTED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "SeoChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoChangeHistory_shop_createdAt_idx" ON "SeoChangeHistory"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "SeoChangeHistory_shop_status_idx" ON "SeoChangeHistory"("shop", "status");

-- CreateIndex
CREATE INDEX "SeoChangeHistory_shop_imageId_idx" ON "SeoChangeHistory"("shop", "imageId");

-- CreateIndex
CREATE INDEX "SeoChangeHistory_shop_productId_changeType_idx" ON "SeoChangeHistory"("shop", "productId", "changeType");
