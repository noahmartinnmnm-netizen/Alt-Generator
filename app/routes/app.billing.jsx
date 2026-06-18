import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  InlineGrid,
  Divider,
  ProgressBar,
  Box,
  Icon,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { BillingError } from "@shopify/shopify-api";
import { authenticate } from "../shopify.server";
import { authenticateAppRequest } from "../lib/app-auth.server.js";
import { getShopCreditBalance } from "../lib/seo.server";
import {
  buildBillingReturnUrl,
  getShopSubscription,
  isBillingTestMode,
} from "../lib/billing.server";
import { PLAN_LIST } from "../lib/plans.server";

export const loader = async ({ request }) => {
  const { session } = await authenticateAppRequest(request);

  const [subscription, creditBalance] = await Promise.all([
    getShopSubscription(session.shop),
    getShopCreditBalance(session.shop),
  ]);

  return {
    plans: PLAN_LIST,
    currentPlanId: subscription.planId,
    creditBalance,
  };
};

export const action = async ({ request }) => {
  const { billing, session, admin } = await authenticate.admin(request);
  const { activateFreePlan, cancelActiveShopifySubscription } = await import("../lib/billing.server");
  const { getPlanById } = await import("../lib/plans.server");

  const formData = await request.formData();
  const planId = formData.get("planId");

  if (planId === "free") {
    const billingIsTest = await isBillingTestMode(admin);
    const billingCheck = await billing.check({ isTest: billingIsTest });
    if (billingCheck.hasActivePayment) {
      await cancelActiveShopifySubscription(admin, session.shop);
    } else {
      await activateFreePlan(session.shop);
    }

    return {
      status: "success",
      message: "You are now on the Free plan.",
    };
  }

  const plan = getPlanById(String(planId));

  if (!plan.billingKey) {
    return { status: "error", message: "Invalid plan selected." };
  }

  const billingIsTest = await isBillingTestMode(admin);

  try {
    await billing.request({
      plan: plan.billingKey,
      isTest: billingIsTest,
      returnUrl: buildBillingReturnUrl(session.shop),
    });
  } catch (error) {
    if (error instanceof BillingError) {
      const shopifyMessage = error.errorData
        ?.map((entry) => entry?.message)
        .filter(Boolean)
        .join(" ");

      console.error("Billing request failed:", {
        shop: session.shop,
        plan: plan.billingKey,
        isTest: billingIsTest,
        errors: error.errorData,
      });

      return {
        status: "error",
        message:
          shopifyMessage ||
          "Could not start billing. Verify the app uses manual pricing (not managed pricing) in the Shopify Partner Dashboard.",
      };
    }

    throw error;
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function PlanCard({ plan, isCurrent, loadingPlanId }) {
  const isPopular = plan.id === "pro";
  const isLoading = loadingPlanId === plan.id;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd">
              {plan.name}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {plan.description}
            </Text>
          </BlockStack>
          {isCurrent ? <Badge tone="success">Current plan</Badge> : null}
          {!isCurrent && isPopular ? <Badge tone="info">Popular</Badge> : null}
        </InlineStack>

        <BlockStack gap="050">
          <InlineStack gap="100" blockAlign="end">
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {plan.price === 0 ? "Free" : `$${plan.price}`}
            </Text>
            {plan.price > 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">
                / month
              </Text>
            ) : null}
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            {plan.tokens} generation tokens per billing period
          </Text>
        </BlockStack>

        <Divider />

        <BlockStack gap="200">
          {plan.features.map((feature) => (
            <InlineStack key={feature} gap="200" blockAlign="start">
              <Box minWidth="20px">
                <Icon source={CheckIcon} tone="success" />
              </Box>
              <Text as="p" variant="bodySm">
                {feature}
              </Text>
            </InlineStack>
          ))}
        </BlockStack>

        <Form method="post">
          <input type="hidden" name="planId" value={plan.id} />
          <Button
            variant={isCurrent ? "secondary" : "primary"}
            disabled={isCurrent || Boolean(loadingPlanId)}
            loading={isLoading}
            submit
            fullWidth
          >
            {isCurrent ? "Current plan" : plan.price === 0 ? "Switch to Free" : `Upgrade to ${plan.name}`}
          </Button>
        </Form>
      </BlockStack>
    </Card>
  );
}

export default function BillingPage() {
  const { plans, currentPlanId, creditBalance } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const loadingPlanId =
    navigation.state !== "idle" ? navigation.formData?.get("planId") : null;

  useEffect(() => {
    if (actionData?.status === "success" && actionData?.message) {
      shopify.toast.show(actionData.message);
    }
    if (actionData?.status === "error" && actionData?.message) {
      shopify.toast.show(actionData.message, { isError: true });
    }
  }, [actionData]);

  const usagePercent =
    creditBalance.totalCredits > 0
      ? (creditBalance.usedCredits / creditBalance.totalCredits) * 100
      : 0;

  return (
    <Page
      title="Plans & billing"
      subtitle="One token generates one alt text or one SEO meta title + description set."
    >
      <Layout>
        <Layout.Section>
          <Banner title="How tokens work" tone="info">
            <p>
              Each generation uses 1 token — whether you create image alt text or a product SEO meta
              title and description. Tokens refresh at the start of each paid billing period. On the
              Free plan, you receive {plans[0].tokens} tokens when you install the app.
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Your usage this period
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {creditBalance.availableCredits} of {creditBalance.totalCredits} tokens remaining
                  </Text>
                </BlockStack>
                <Badge tone="success">
                  {plans.find((plan) => plan.id === currentPlanId)?.name || "Free"} plan
                </Badge>
              </InlineStack>
              <ProgressBar
                progress={usagePercent}
                size="small"
                tone={usagePercent >= 90 ? "critical" : usagePercent >= 70 ? "highlight" : "success"}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={plan.id === currentPlanId}
                loadingPlanId={loadingPlanId}
              />
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
