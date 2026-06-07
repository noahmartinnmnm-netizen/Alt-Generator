import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Reset onboarding so a reinstall gets a clean first-run experience.
  if (db.shopSettings) {
    await db.shopSettings.updateMany({
      where: { shop },
      data: { onboardingCompleted: false },
    });
  }

  return new Response();
};
