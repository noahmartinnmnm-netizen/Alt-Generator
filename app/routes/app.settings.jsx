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
  Banner
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopSettings, saveShopSettings } from "../lib/seo.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);

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

  const industryOptions = [
    { label: "Select Industry", value: "" },
    { label: "Fashion & Apparel", value: "fashion" },
    { label: "Home & Garden", value: "home_garden" },
    { label: "Electronics & Tech", value: "electronics" },
    { label: "Health & Beauty", value: "beauty" },
    { label: "Sports & Fitness", value: "sports" },
    { label: "Other", value: "other" },
  ];

  const handleSave = () => {
    fetcher.submit(formState, { method: "POST" });
  };

  return (
    <Page
      title="SEO Settings"
      subtitle="Configure your business profile to improve AI-generated alt text and SEO."
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{
        content: "Save settings",
        onAction: handleSave,
        loading: isSaving,
      }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>
              This settings page is for enhancing your experience with SEO. More information will improve the AI-generated results for your store.
            </p>
          </Banner>
        </Layout.Section>

        {fetcher.data?.success && (
          <Layout.Section>
            <Banner title="Settings saved" tone="success" onDismiss={() => {}} />
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
                Save Settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
