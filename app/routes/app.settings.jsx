import {
  Card,
  Layout,
  Page,
  Text,
  BlockStack,
  TextField,
  Select,
  Button,
  InlineStack,
  Banner,
  Box,
  Link,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopSettings, saveShopSettings } from "../lib/seo.server";
import { INDUSTRY_OPTIONS, TONE_OPTIONS } from "../lib/brand-profile.js";

export const loader = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);

  if (!settings?.onboardingCompleted) {
    throw redirect("/app/onboarding");
  }

  return { settings: settings || {} };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const settings = {
    industry: formData.get("industry"),
    otherIndustry: formData.get("otherIndustry"),
    brandName: formData.get("brandName"),
    brandTagline: formData.get("brandTagline"),
    brandValueProp: formData.get("brandValueProp"),
    productCategories: formData.get("productCategories"),
    searchTerms: formData.get("searchTerms"),
    tone: formData.get("tone") || "professional",
  };

  await saveShopSettings(session.shop, settings);
  return { success: true };
};

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const [formState, setFormState] = useState(settings);

  const isSaving = fetcher.state !== "idle";

  const handleFieldChange = useCallback((field) => (value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const industryOptions = INDUSTRY_OPTIONS;

  const toneOptions = [
    { label: "Select tone", value: "" },
    ...TONE_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
  ];

  const handleSave = () => {
    fetcher.submit(formState, { method: "POST" });
  };

  return (
    <Page
      title="Brand profile"
      subtitle="Update how AI writes alt text for your products — brand voice, industry, tone, and SEO keywords."
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{
        content: "Save brand profile",
        onAction: handleSave,
        loading: isSaving,
      }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>
              These settings power every AI alt text generation. The more complete your brand profile, the better your results.
            </p>
          </Banner>
        </Layout.Section>

        {fetcher.data?.success && (
          <Layout.Section>
            <Banner title="Brand profile saved" tone="success" onDismiss={() => {}} />
          </Layout.Section>
        )}
        
        <Layout.Section>
          <BlockStack gap="500">
            {/* Business Information */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Business Information
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Understand your industry to tailor alt text generation and SEO recommendations.
                </Text>
                <BlockStack gap="300">
                  <Select
                    label="Industry"
                    options={industryOptions}
                    value={formState.industry || ""}
                    onChange={handleFieldChange("industry")}
                    helpText="Tailors AI generation for industry-specific terminology."
                  />
                  {formState.industry === "other" && (
                    <TextField
                      label="Describe your business"
                      value={formState.otherIndustry || ""}
                      onChange={handleFieldChange("otherIndustry")}
                      placeholder="e.g. Handmade wooden toys, Eco-friendly packaging..."
                      multiline={2}
                      autoComplete="off"
                    />
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Brand Keywords */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Brand Identity
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Capture brand identity for consistent alt text generation.
                </Text>
                <TextField
                  label="Brand Name"
                  value={formState.brandName || ""}
                  onChange={handleFieldChange("brandName")}
                  placeholder="e.g. EcoStyle"
                  autoComplete="off"
                />
                <Select
                  label="Tone of voice"
                  options={toneOptions}
                  value={formState.tone || ""}
                  onChange={handleFieldChange("tone")}
                  helpText="Controls how AI writes alt text — professional, friendly, luxury, and more."
                />
                {formState.tone && (
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {TONE_OPTIONS.find((option) => option.value === formState.tone)?.description}
                    </Text>
                  </Box>
                )}
                <TextField
                  label="Tagline"
                  value={formState.brandTagline || ""}
                  onChange={handleFieldChange("brandTagline")}
                  placeholder="e.g. Sustainable fashion for everyone"
                  autoComplete="off"
                />
                <TextField
                  label="Unique Value Propositions"
                  value={formState.brandValueProp || ""}
                  onChange={handleFieldChange("brandValueProp")}
                  placeholder="e.g. 100% organic cotton, plastic-free shipping"
                  multiline={3}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            {/* SEO Keywords */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  SEO Strategy
                </Text>
                <Text as="p" variant="bodyMd" color="subdued">
                  Capture product-level and search-intent keywords.
                </Text>
                <TextField
                  label="Product Categories & Features"
                  value={formState.productCategories || ""}
                  onChange={handleFieldChange("productCategories")}
                  placeholder="e.g. Women's dresses, Summer collection, Floral patterns"
                  multiline={2}
                  autoComplete="off"
                  helpText="Common categories or features across your store."
                />
                <TextField
                  label="Customer Search Terms"
                  value={formState.searchTerms || ""}
                  onChange={handleFieldChange("searchTerms")}
                  placeholder="e.g. eco-friendly clothing, sustainable summer dress"
                  multiline={2}
                  autoComplete="off"
                  helpText="Terms your customers use to find your products."
                />
              </BlockStack>
            </Card>

            <InlineStack align="end">
              <Button variant="primary" onClick={handleSave} loading={isSaving}>
                Save brand profile
              </Button>
            </InlineStack>

            <Box paddingBlockStart="400">
              <InlineStack gap="300" align="center">
                <Link url="/app/faq">Help & FAQ</Link>
                <Text as="span" variant="bodySm" tone="subdued">·</Text>
                <Link url="/privacy" target="_blank">Privacy Policy</Link>
                <Text as="span" variant="bodySm" tone="subdued">·</Text>
                <Link url="/terms" target="_blank">Terms of Service</Link>
              </InlineStack>
            </Box>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
