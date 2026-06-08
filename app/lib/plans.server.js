/** @typedef {"free" | "starter" | "pro" | "premium"} PlanId */

export const BILLING_PLAN_STARTER = "Starter";
export const BILLING_PLAN_PRO = "Pro";
export const BILLING_PLAN_PREMIUM = "Premium";

/** @type {Record<PlanId, { id: PlanId, name: string, price: number, tokens: number, billingKey: string | null, description: string, features: string[] }>} */
export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    tokens: 30,
    billingKey: null,
    description: "Try AI alt text and SEO generation on a small catalog.",
    features: [
      "30 generation tokens",
      "Alt text + SEO meta tags",
      "Brand profile & history",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 5,
    tokens: 180,
    billingKey: BILLING_PLAN_STARTER,
    description: "For growing stores optimizing product media regularly.",
    features: [
      "180 generation tokens per month",
      "Alt text + SEO meta tags",
      "Priority generation queue",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 8,
    tokens: 350,
    billingKey: BILLING_PLAN_PRO,
    description: "More tokens for stores with larger catalogs.",
    features: [
      "350 generation tokens per month",
      "Alt text + SEO meta tags",
      "Bulk generate & publish",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: 12,
    tokens: 500,
    billingKey: BILLING_PLAN_PREMIUM,
    description: "Best value for high-volume SEO optimization.",
    features: [
      "500 generation tokens per month",
      "Alt text + SEO meta tags",
      "Bulk generate & publish",
    ],
  },
};

export const PLAN_LIST = [PLANS.free, PLANS.starter, PLANS.pro, PLANS.premium];

const BILLING_KEY_TO_PLAN_ID = {
  [BILLING_PLAN_STARTER]: "starter",
  [BILLING_PLAN_PRO]: "pro",
  [BILLING_PLAN_PREMIUM]: "premium",
};

/**
 * @param {string | null | undefined} planId
 */
export function getPlanById(planId) {
  return PLANS[/** @type {PlanId} */ (planId)] || PLANS.free;
}

/**
 * @param {string | null | undefined} billingPlanName
 */
export function getPlanByBillingName(billingPlanName) {
  const planId = BILLING_KEY_TO_PLAN_ID[billingPlanName];
  return planId ? PLANS[planId] : PLANS.free;
}

/**
 * @param {string | null | undefined} billingPlanName
 */
export function isPaidBillingPlan(billingPlanName) {
  return Boolean(billingPlanName && BILLING_KEY_TO_PLAN_ID[billingPlanName]);
}
