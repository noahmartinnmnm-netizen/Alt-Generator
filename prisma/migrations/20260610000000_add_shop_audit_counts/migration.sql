-- CreateTable
CREATE TABLE "ShopAuditCounts" (
    "shop" TEXT NOT NULL,
    "totalImages" INTEGER NOT NULL DEFAULT 0,
    "missingAltText" INTEGER NOT NULL DEFAULT 0,
    "optimizedAltText" INTEGER NOT NULL DEFAULT 0,
    "productsMissingSeo" INTEGER NOT NULL DEFAULT 0,
    "aiGenerated" INTEGER NOT NULL DEFAULT 0,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopAuditCounts_pkey" PRIMARY KEY ("shop")
);
