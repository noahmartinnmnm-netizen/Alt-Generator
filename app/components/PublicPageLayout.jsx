import { Link } from "react-router";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { Page, Layout, Box, Text, InlineStack } from "@shopify/polaris";
import { APP_NAME } from "../lib/legal-content";

export function PublicPageLayout({ title, children }) {
  return (
    <PolarisProvider i18n={enTranslations}>
      <Box paddingBlock="800" paddingInline="400">
        <div style={{ maxWidth: "48rem", margin: "0 auto" }}>
          <Page title={title} subtitle={APP_NAME}>
            <Layout>
              <Layout.Section>{children}</Layout.Section>
              <Layout.Section>
                <Box paddingBlockStart="600">
                  <InlineStack gap="300" align="center">
                    <Link to="/privacy" style={{ textDecoration: "none" }}>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Privacy Policy
                      </Text>
                    </Link>
                    <Text as="span" variant="bodySm" tone="subdued">
                      ·
                    </Text>
                    <Link to="/terms" style={{ textDecoration: "none" }}>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Terms of Service
                      </Text>
                    </Link>
                    <Text as="span" variant="bodySm" tone="subdued">
                      ·
                    </Text>
                    <Link to="/faq" style={{ textDecoration: "none" }}>
                      <Text as="span" variant="bodySm" tone="subdued">
                        FAQ
                      </Text>
                    </Link>
                  </InlineStack>
                </Box>
              </Layout.Section>
            </Layout>
          </Page>
        </div>
      </Box>
    </PolarisProvider>
  );
}
