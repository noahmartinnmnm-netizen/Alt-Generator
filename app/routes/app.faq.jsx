import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Link,
  Divider,
  Box,
  InlineStack,
} from "@shopify/polaris";
import { authenticateAppRequest } from "../lib/app-auth.server.js";
import { FAQ_ITEMS } from "../lib/faq-content";
import { APP_NAME, SUPPORT_EMAIL, APP_URL } from "../lib/legal-content";

export const loader = async ({ request }) => {
  await authenticateAppRequest(request);
  return {};
};

export const shouldRevalidate = () => false;

export default function FaqPage() {
  return (
    <Page
      title="Help & FAQ"
      subtitle={`Answers to common questions about ${APP_NAME}.`}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {FAQ_ITEMS.map((item, index) => (
              <BlockStack key={item.question} gap="400">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      {item.question}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {item.answer}
                    </Text>
                  </BlockStack>
                </Card>
                {index < FAQ_ITEMS.length - 1 && <Divider />}
              </BlockStack>
            ))}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Need more help?
                </Text>
                <Text as="p" variant="bodyMd">
                  Contact us at {SUPPORT_EMAIL} and we&apos;ll get back to you within 2 business days.
                </Text>
                <Box paddingBlockStart="200">
                  <InlineStack gap="300">
                    <Link url={`${APP_URL}/privacy`} target="_blank">
                      Privacy Policy
                    </Link>
                    <Link url={`${APP_URL}/terms`} target="_blank">
                      Terms of Service
                    </Link>
                  </InlineStack>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
