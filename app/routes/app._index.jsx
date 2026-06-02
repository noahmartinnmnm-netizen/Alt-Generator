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
  ProgressBar
} from "@shopify/polaris";
import {
  MagicIcon,
  ImageIcon,
  SettingsIcon,
  CheckIcon,
  CreditCardIcon
} from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { 
    getAllProductImages, 
    getShopSettings,
    getShopAltTextUsageCount,
    getShopCreditBalance
  } = await import("../lib/seo.server");
  
  const { session, admin } = await authenticate.admin(request);
  const productImages = await getAllProductImages(admin);
  const usageCount = await getShopAltTextUsageCount(session.shop);
  const shopSettings = await getShopSettings(session.shop);
  const creditBalance = await getShopCreditBalance(session.shop);

  const totalImages = productImages.length;
  const imagesWithoutAltCount = productImages.filter(img => !img.altText || img.altText.trim() === "").length;
  const optimizedCount = totalImages - imagesWithoutAltCount;
  const progress = totalImages > 0 ? (optimizedCount / totalImages) * 100 : 0;

  return {
    shop: session.shop,
    totalImages,
    optimizedCount,
    imagesWithoutAltCount,
    aiGeneratedCount: usageCount,
    availableCredits: creditBalance.availableCredits,
    totalCredits: creditBalance.totalCredits,
    progress,
    shopSettings
  };
};

export default function Dashboard() {
  const { 
    totalImages,
    optimizedCount,
    imagesWithoutAltCount,
    aiGeneratedCount,
    availableCredits,
    totalCredits,
    progress
  } = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Banner title="Welcome to SEO Hero AI" tone="info">
            <p>Your AI-powered assistant for Shopify SEO optimization. Monitor and improve your store&apos;s search visibility from here.</p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Total Images</Text>
                  <Icon source={ImageIcon} tone="base" />
                </InlineStack>
                <Text as="p" variant="headingLg">{totalImages}</Text>
                <Text as="p" color="subdued">All product images</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Optimized</Text>
                  <Icon source={CheckIcon} tone="success" />
                </InlineStack>
                <Text as="p" variant="headingLg" tone="success">{optimizedCount}</Text>
                <Box paddingBlockStart="200">
                  <ProgressBar progress={progress} size="small" tone="success" />
                </Box>
                <Text as="p" color="subdued">{progress.toFixed(0)}% Complete</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">AI Generated</Text>
                  <Icon source={MagicIcon} tone="info" />
                </InlineStack>
                <Text as="p" variant="headingLg" tone="info">{aiGeneratedCount}</Text>
                <Text as="p" color="subdued">Total AI alt texts</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={2} gap="400">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Missing Alt Text</Text>
                  <Icon source={MagicIcon} tone="caution" />
                </InlineStack>
                <Text as="p" variant="headingLg" tone="caution">{imagesWithoutAltCount}</Text>
                <Text as="p" color="subdued">Images needing attention</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Available Credits</Text>
                  <Icon source={CreditCardIcon} tone="base" />
                </InlineStack>
                <Text as="p" variant="headingLg">{availableCredits}</Text>
                <Text as="p" color="subdued">Remaining AI generations out of {totalCredits}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Quick Actions</Text>
              <InlineStack gap="400">
                <Button 
                  icon={MagicIcon} 
                  variant="primary"
                  onClick={() => navigate("/app/image-alt-text")}
                >
                  Bulk Generate Alt Text
                </Button>
                <Button 
                  icon={ImageIcon}
                  onClick={() => navigate("/app/image-alt-text")}
                >
                  Image Library
                </Button>
                <Button 
                  icon={SettingsIcon}
                  onClick={() => navigate("/app/settings")}
                >
                  Configure Settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
