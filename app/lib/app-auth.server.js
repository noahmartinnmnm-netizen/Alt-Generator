import { authenticate } from "../shopify.server";
import { getShopSettings } from "./seo.server";

/**
 * Authenticates an embedded app request and ensures onboarding is complete.
 * @param {import("react-router").LoaderFunctionArgs["request"]} request
 */
export async function authenticateAppRequest(request) {
  const auth = await authenticate.admin(request);
  const shopSettings = await getShopSettings(auth.session.shop);

  if (!shopSettings?.onboardingCompleted) {
    throw auth.redirect("/app/onboarding");
  }

  return { ...auth, shopSettings };
}
