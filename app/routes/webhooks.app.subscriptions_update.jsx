import { authenticate } from "../shopify.server";
import {
  activateFreePlan,
  activatePaidPlan,
  resetBillingPeriodTokens,
} from "../lib/billing.server";
import { getPlanByBillingName } from "../lib/plans.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const subscription = payload?.app_subscription;
  const status = subscription?.status;
  const planName = subscription?.name;

  if (status === "ACTIVE" && planName) {
    const plan = getPlanByBillingName(planName);
    if (plan.id !== "free") {
      await activatePaidPlan(shop, plan.id, {
        id: subscription.admin_graphql_api_id,
        status,
      });
      await resetBillingPeriodTokens(shop, plan.id);
    }
    return new Response();
  }

  if (status === "CANCELLED" || status === "DECLINED" || status === "EXPIRED" || status === "FROZEN") {
    await activateFreePlan(shop);
  }

  return new Response();
};
