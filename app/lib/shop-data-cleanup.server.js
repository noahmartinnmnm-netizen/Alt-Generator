import db from "../db.server";

/**
 * Deletes all shop-specific data from the database.
 * Used on app uninstall and shop/redact compliance webhooks.
 */
export async function deleteShopData(shop) {
  await db.session.deleteMany({ where: { shop } });

  if (db.shopSettings) {
    await db.shopSettings.updateMany({
      where: { shop },
      data: { onboardingCompleted: false },
    });
  }

  if (db.shopSubscription) {
    await db.shopSubscription.deleteMany({ where: { shop } });
  }

  if (db.shopCredits) {
    await db.shopCredits.deleteMany({ where: { shop } });
  }

  if (db.creditUsage) {
    await db.creditUsage.deleteMany({ where: { shop } });
  }

  if (db.seoChangeHistory) {
    await db.seoChangeHistory.deleteMany({ where: { shop } });
  }
}
