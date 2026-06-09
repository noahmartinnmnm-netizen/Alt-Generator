import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  InlineGrid,
  Icon,
  ProgressBar,
  Badge,
  Divider,
} from "@shopify/polaris";
import {
  MagicIcon,
  ImageIcon,
  SettingsIcon,
  CheckIcon,
  CreditCardIcon,
  AlertCircleIcon,
  ArrowRightIcon,
} from "@shopify/polaris-icons";
import { getIndustryLabel, getToneLabel } from "../lib/brand-profile.js";

export const loader = async ({ request }) => {
  const {
    getAllProductImages,
    getShopSettings,
    getShopAltTextUsageCount,
    getShopCreditBalance,
    getImageAuditCounts,
    computeSeoHealthScore,
  } = await import("../lib/seo.server");
  const { getShopSubscription, syncSubscriptionFromBillingCheck } = await import("../lib/billing.server");
  const { PLAN_LIST } = await import("../lib/plans.server");

  const { session, admin, redirect, billing } = await authenticate.admin(request);
  const shopSettings = await getShopSettings(session.shop);

  if (!shopSettings?.onboardingCompleted) {
    throw redirect("/app/onboarding");
  }

  const { isBillingTestMode } = await import("../lib/billing.server");
  const billingCheck = await billing.check({
    plans: PLAN_LIST.map((plan) => plan.billingKey).filter(Boolean),
    isTest: isBillingTestMode(),
  });
  await syncSubscriptionFromBillingCheck(session.shop, billingCheck);

  const [productImages, usageCount, creditBalance, counts, subscription] = await Promise.all([
    getAllProductImages(admin),
    getShopAltTextUsageCount(session.shop),
    getShopCreditBalance(session.shop),
    getImageAuditCounts(admin, session.shop),
    getShopSubscription(session.shop),
  ]);

  const totalImages = counts.totalImages;
  const imagesWithoutAltCount = counts.missingAltText;
  const optimizedCount = counts.optimizedAltText;
  const progress = totalImages > 0 ? (optimizedCount / totalImages) * 100 : 0;

  const seoHealth = computeSeoHealthScore({ counts, shopSettings, productImages });

  return {
    shop: session.shop,
    totalImages,
    optimizedCount,
    imagesWithoutAltCount,
    aiGeneratedCount: usageCount,
    availableCredits: creditBalance.availableCredits,
    totalCredits: creditBalance.totalCredits,
    progress,
    shopSettings,
    seoHealth,
    counts,
    currentPlan: subscription.plan,
  };
};

function scoreTone(grade) {
  if (grade === "good") return "success";
  if (grade === "fair") return "warning";
  return "critical";
}

function scoreLabel(grade) {
  if (grade === "good") return "Strong";
  if (grade === "fair") return "Needs work";
  return "Critical";
}

function priorityBadge(priority) {
  if (priority === "high") return <Badge tone="critical">High impact</Badge>;
  if (priority === "medium") return <Badge tone="warning">Medium impact</Badge>;
  return <Badge tone="info">Low impact</Badge>;
}

export default function Dashboard() {
  const {
    totalImages,
    optimizedCount,
    imagesWithoutAltCount,
    aiGeneratedCount,
    availableCredits,
    totalCredits,
    progress,
    shopSettings,
    seoHealth,
    counts,
    currentPlan,
  } = useLoaderData();
  const navigate = useNavigate();

  const industryLabel = getIndustryLabel(shopSettings?.industry, shopSettings?.otherIndustry);
  const toneLabel = getToneLabel(shopSettings?.tone);

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Your plan
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    You are on the <strong>{currentPlan.name}</strong> plan — {availableCredits} of{" "}
                    {totalCredits} generation tokens remaining. One token = one alt text or one SEO
                    meta title + description.
                  </Text>
                </BlockStack>
                <Badge tone={currentPlan.id === "free" ? "info" : "success"}>
                  {currentPlan.name}
                  {currentPlan.price > 0 ? ` · $${currentPlan.price}/mo` : ""}
                </Badge>
              </InlineStack>
              <ProgressBar
                progress={totalCredits > 0 ? ((totalCredits - availableCredits) / totalCredits) * 100 : 0}
                size="small"
                tone={availableCredits === 0 ? "critical" : availableCredits <= totalCredits * 0.2 ? "highlight" : "success"}
              />
              <InlineStack gap="200">
                <Button variant="primary" onClick={() => navigate("/app/billing")}>
                  {currentPlan.id === "free" ? "View plans & upgrade" : "Manage plan"}
                </Button>
                {availableCredits === 0 ? (
                  <Button onClick={() => navigate("/app/billing")}>Get more tokens</Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="start">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Image SEO Health Score
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Based on alt text coverage, quality, product listings, and brand profile.
                    </Text>
                  </BlockStack>
                  <Badge tone={scoreTone(seoHealth.grade)}>{scoreLabel(seoHealth.grade)}</Badge>
                </InlineStack>

                <InlineStack gap="500" blockAlign="center">
                  <Box
                    padding="500"
                    borderRadius="full"
                    background={
                      seoHealth.grade === "good"
                        ? "bg-fill-success-secondary"
                        : seoHealth.grade === "fair"
                          ? "bg-fill-warning-secondary"
                          : "bg-fill-critical-secondary"
                    }
                    minWidth="120px"
                    minHeight="120px"
                  >
                    <BlockStack inlineAlign="center" align="center" gap="050">
                      <Text as="p" variant="heading2xl" fontWeight="bold">
                        {seoHealth.score}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        / 100
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box minWidth="0" width="100%">
                    <BlockStack gap="300">
                      {Object.values(seoHealth.breakdown).map((item) => (
                        <BlockStack key={item.label} gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">
                              {item.label}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {item.score}/{item.max}
                            </Text>
                          </InlineStack>
                          <ProgressBar
                            progress={(item.score / item.max) * 100}
                            size="small"
                            tone={item.score / item.max >= 0.8 ? "success" : item.score / item.max >= 0.5 ? "highlight" : "critical"}
                          />
                        </BlockStack>
                      ))}
                    </BlockStack>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Your brand profile
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  AI uses these settings for every alt text and SEO generation.
                </Text>
                <BlockStack gap="200">
                  <ProfileChip label="Brand" value={shopSettings?.brandName} />
                  <ProfileChip label="Industry" value={industryLabel} />
                  <ProfileChip label="Tone" value={toneLabel} />
                  {shopSettings?.searchTerms && (
                    <ProfileChip label="Keywords" value={shopSettings.searchTerms} />
                  )}
                </BlockStack>
                <Button icon={SettingsIcon} onClick={() => navigate("/app/settings")}>
                  Edit brand profile
                </Button>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {seoHealth.actions.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Priority actions
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Fix these to improve your score fastest.
                    </Text>
                  </BlockStack>
                  <Icon source={AlertCircleIcon} tone="caution" />
                </InlineStack>

                <BlockStack gap="300">
                  {seoHealth.actions.map((action) => (
                    <Box
                      key={action.id}
                      padding="400"
                      borderWidth="025"
                      borderRadius="200"
                      borderColor="border"
                      background="bg-surface"
                    >
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            {priorityBadge(action.priority)}
                            <Text as="h3" variant="headingSm">
                              {action.title}
                            </Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {action.description}
                          </Text>
                        </BlockStack>
                        <Button icon={ArrowRightIcon} onClick={() => navigate(action.href)}>
                          Fix now
                        </Button>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {seoHealth.score >= 80 && seoHealth.actions.length === 0 && (
          <Layout.Section>
            <Banner title="Great job — your image SEO is in strong shape" tone="success">
              <p>Keep monitoring new product uploads and generate alt text as you add images.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <MetricCard
              title="Total images"
              value={totalImages}
              subtitle="Across all products"
              icon={ImageIcon}
            />
            <MetricCard
              title="With alt text"
              value={optimizedCount}
              subtitle={`${progress.toFixed(0)}% coverage`}
              icon={CheckIcon}
              tone="success"
              progress={progress}
            />
            <MetricCard
              title="Missing alt text"
              value={imagesWithoutAltCount}
              subtitle="Needs attention"
              icon={MagicIcon}
              tone="caution"
            />
            <MetricCard
              title="AI generated"
              value={aiGeneratedCount}
              subtitle={`${availableCredits} tokens left`}
              icon={CreditCardIcon}
            />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Quick actions
              </Text>
              <Divider />
              <InlineStack gap="300" wrap>
                <Button
                  icon={MagicIcon}
                  variant="primary"
                  onClick={() => navigate("/app/image-alt-text?filter=missing_alt")}
                  disabled={imagesWithoutAltCount === 0}
                >
                  Fix {imagesWithoutAltCount} missing alt texts
                </Button>
                <Button icon={ImageIcon} onClick={() => navigate("/app/image-alt-text")}>
                  Image library
                </Button>
                {counts.productsMissingSeo > 0 && (
                  <Button onClick={() => navigate("/app/image-alt-text?filter=needs_seo")}>
                    Fix {counts.productsMissingSeo} product SEO listings
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function MetricCard({ title, value, subtitle, icon, tone, progress }) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
          <Icon source={icon} tone={tone || "base"} />
        </InlineStack>
        <Text as="p" variant="headingLg" tone={tone}>
          {value}
        </Text>
        {progress !== undefined && (
          <ProgressBar progress={progress} size="small" tone="success" />
        )}
        <Text as="p" color="subdued">
          {subtitle}
        </Text>
      </BlockStack>
    </Card>
  );
}

function ProfileChip({ label, value }) {
  if (!value) return null;
  return (
    <InlineStack gap="200">
      <Badge tone="info">{label}</Badge>
      <Text as="span" variant="bodySm">
        {value}
      </Text>
    </InlineStack>
  );
}
