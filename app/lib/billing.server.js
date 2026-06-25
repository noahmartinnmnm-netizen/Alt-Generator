import prisma from "../db.server";
import { getPlanByBillingName, getPlanById, PLANS } from "./plans.server";

/**
 * Whether the shop is a Partner development store.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 */
export async function isShopPartnerDevelopment(admin) {
  const response = await admin.graphql(
    `#graphql
      query ShopPlan {
        shop {
          plan {
            partnerDevelopment
          }
        }
      }`
  );
  const payload = await response.json();
  return Boolean(payload?.data?.shop?.plan?.partnerDevelopment);
}

/**
 * Whether Shopify billing charges should be created as test charges.
 * Dev stores require test charges; production stores require live charges.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} [admin]
 */
export async function isBillingTestMode(admin) {
  if (process.env.SHOPIFY_BILLING_TEST === "true") {
    return true;
  }
  if (process.env.SHOPIFY_BILLING_TEST === "false") {
    return false;
  }
  if (admin) {
    return await isShopPartnerDevelopment(admin);
  }
  return process.env.NODE_ENV !== "production";
}

/**
 * Builds the URL Shopify redirects to after the merchant approves billing.
 * Embedded apps should use the admin.shopify.com app URL format.
 * @param {string} shop
 * @param {string} [path="/app/billing"]
 */
export function buildBillingReturnUrl(shop, path = "/app/billing") {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (apiKey && shop) {
    const shopHandle = shop.replace(/\.myshopify\.com$/i, "");
    return `https://admin.shopify.com/store/${shopHandle}/apps/${apiKey}${normalizedPath}`;
  }

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    throw new Error(
      "SHOPIFY_APP_URL is not set. Run the app with `shopify app dev` or configure SHOPIFY_APP_URL."
    );
  }

  const returnUrl = new URL(normalizedPath, appUrl);
  returnUrl.searchParams.set("shop", shop);
  return returnUrl.toString();
}

/**
 * Ensures every shop has a subscription record (defaults to Free on install).
 * @param {string} shop
 */
export async function ensureShopSubscription(shop) {
  if (!prisma.shopSubscription || !shop) {
    return { planId: "free", status: "ACTIVE", shopifySubscriptionId: null };
  }

  return await prisma.shopSubscription.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      planId: "free",
      status: "ACTIVE",
    },
  });
}

/**
 * @param {string} shop
 */
export async function getShopSubscription(shop) {
  const subscription = await ensureShopSubscription(shop);
  const plan = getPlanById(subscription.planId);

  return {
    ...subscription,
    plan,
  };
}

/**
 * Sets the shop's token allowance to match the active plan.
 * @param {string} shop
 * @param {import("./plans.server").PlanId} planId
 */
export async function syncPlanCredits(shop, planId) {
  const plan = getPlanById(planId);

  if (!prisma.shopCredits || !shop) {
    return null;
  }

  const existing = await prisma.shopCredits.findUnique({ where: { shop } });

  if (!existing) {
    return await prisma.shopCredits.create({
      data: {
        shop,
        totalCredits: plan.tokens,
        usedCredits: 0,
      },
    });
  }

  const usedCredits = Math.min(existing.usedCredits, plan.tokens);

  return await prisma.shopCredits.update({
    where: { shop },
    data: {
      totalCredits: plan.tokens,
      usedCredits,
    },
  });
}

/**
 * Activates a paid plan after Shopify billing approval.
 * @param {string} shop
 * @param {import("./plans.server").PlanId} planId
 * @param {{ id?: string, status?: string }} [shopifySubscription]
 */
export async function activatePaidPlan(shop, planId, shopifySubscription = {}) {
  if (!prisma.shopSubscription) {
    return null;
  }

  const subscription = await prisma.shopSubscription.upsert({
    where: { shop },
    update: {
      planId,
      shopifySubscriptionId: shopifySubscription.id || null,
      status: shopifySubscription.status || "ACTIVE",
    },
    create: {
      shop,
      planId,
      shopifySubscriptionId: shopifySubscription.id || null,
      status: shopifySubscription.status || "ACTIVE",
    },
  });

  await syncPlanCredits(shop, planId);
  return subscription;
}

/**
 * Downgrades a shop to the free plan and resets monthly token allowance.
 * @param {string} shop
 */
export async function activateFreePlan(shop) {
  if (!prisma.shopSubscription) {
    return null;
  }

  const subscription = await prisma.shopSubscription.upsert({
    where: { shop },
    update: {
      planId: "free",
      shopifySubscriptionId: null,
      status: "ACTIVE",
    },
    create: {
      shop,
      planId: "free",
      status: "ACTIVE",
    },
  });

  await syncPlanCredits(shop, "free");
  return subscription;
}

/**
 * Loads active app subscriptions from Shopify (test and live).
 * billing.check({ isTest: false }) omits test subscriptions, which breaks sync when
 * Shopify creates a test charge on stores that are not flagged as partner development.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 */
export async function fetchActiveAppSubscriptions(admin) {
  const response = await admin.graphql(
    `#graphql
      query ActiveAppSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
          }
        }
      }`
  );
  const payload = await response.json();
  return payload?.data?.currentAppInstallation?.activeSubscriptions || [];
}

/**
 * Syncs local subscription state with Shopify Billing API (source of truth).
 * Call after billing approval redirects so the UI reflects the new plan immediately.
 * @param {string} shop
 * @param {import("@shopify/shopify-app-react-router/server").BillingContext} billing
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 * @param {{ retryOnEmpty?: boolean }} [options]
 */
export async function syncShopSubscriptionWithShopify(shop, billing, admin, options = {}) {
  let subscriptions = await fetchActiveAppSubscriptions(admin);

  if (subscriptions.length === 0 && options.retryOnEmpty) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    subscriptions = await fetchActiveAppSubscriptions(admin);
  }

  if (subscriptions.length > 0) {
    return await syncSubscriptionFromBillingCheck(shop, {
      appSubscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        name: subscription.name,
        status: subscription.status,
      })),
    });
  }

  // Fallback: isTest true includes both test and live subscriptions (Shopify API filter).
  const billingCheck = await billing.check({ isTest: true });
  return await syncSubscriptionFromBillingCheck(shop, billingCheck);
}

/**
 * Syncs local plan state from Shopify Billing API check results.
 * @param {string} shop
 * @param {{ appSubscriptions?: Array<{ name?: string, id?: string, status?: string }> }} billingCheck
 */
export async function syncSubscriptionFromBillingCheck(shop, billingCheck) {
  const activeSubscription =
    billingCheck?.appSubscriptions?.find((subscription) => subscription.status === "ACTIVE") ||
    billingCheck?.appSubscriptions?.[0];

  if (!activeSubscription?.name) {
    const current = await ensureShopSubscription(shop);
    if (current.planId !== "free") {
      return await activateFreePlan(shop);
    }
    await syncPlanCredits(shop, "free");
    return current;
  }

  const plan = getPlanByBillingName(activeSubscription.name);
  if (plan.id === "free") {
    return await activateFreePlan(shop);
  }

  return await activatePaidPlan(shop, plan.id, {
    id: activeSubscription.id,
    status: activeSubscription.status,
  });
}

/**
 * Resolves which paid billing plan name is active, if any.
 * @param {{ appSubscriptions?: Array<{ name?: string, status?: string }> }} billingCheck
 */
export function getActiveBillingPlanName(billingCheck) {
  const active = billingCheck?.appSubscriptions?.find(
    (subscription) => subscription.status === "ACTIVE"
  );
  return active?.name || null;
}

/**
 * @param {string} shop
 */
export async function initializeShopBilling(shop) {
  await ensureShopSubscription(shop);
  await syncPlanCredits(shop, "free");
}

/**
 * Resets used tokens at the start of a new billing period.
 * @param {string} shop
 * @param {import("./plans.server").PlanId} planId
 */
export async function resetBillingPeriodTokens(shop, planId) {
  const plan = getPlanById(planId);

  if (!prisma.shopCredits) {
    return null;
  }

  return await prisma.shopCredits.upsert({
    where: { shop },
    update: {
      totalCredits: plan.tokens,
      usedCredits: 0,
    },
    create: {
      shop,
      totalCredits: plan.tokens,
      usedCredits: 0,
    },
  });
}

/**
 * Cancels the active Shopify subscription for a shop.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 * @param {string} shop
 */
export async function cancelActiveShopifySubscription(admin, shop) {
  const subscription = await ensureShopSubscription(shop);

  if (!subscription.shopifySubscriptionId) {
    return await activateFreePlan(shop);
  }

  const response = await admin.graphql(
    `#graphql
      mutation AppSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        id: subscription.shopifySubscriptionId,
      },
    }
  );

  const payload = await response.json();
  const userErrors = payload?.data?.appSubscriptionCancel?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((error) => error.message).join(", "));
  }

  return await activateFreePlan(shop);
}

export { PLANS };
