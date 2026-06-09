import prisma from "../db.server";
import { getPlanByBillingName, getPlanById, PLANS } from "./plans.server";

/**
 * Whether Shopify billing charges should be created as test charges.
 * Dev stores require test charges; production stores require live charges.
 */
export function isBillingTestMode() {
  if (process.env.SHOPIFY_BILLING_TEST === "true") {
    return true;
  }
  if (process.env.SHOPIFY_BILLING_TEST === "false") {
    return false;
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
 * Syncs local plan state from Shopify Billing API check results.
 * @param {string} shop
 * @param {{ appSubscriptions?: Array<{ name?: string, id?: string, status?: string }> }} billingCheck
 */
export async function syncSubscriptionFromBillingCheck(shop, billingCheck) {
  const activeSubscription = billingCheck?.appSubscriptions?.find(
    (subscription) => subscription.status === "ACTIVE"
  );

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
