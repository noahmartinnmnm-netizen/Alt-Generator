-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "tone" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
