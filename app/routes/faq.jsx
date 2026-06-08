import { Text, BlockStack, Card, Divider } from "@shopify/polaris";
import { PublicPageLayout } from "../components/PublicPageLayout";
import { FAQ_ITEMS } from "../lib/faq-content";
import { SUPPORT_EMAIL } from "../lib/legal-content";

export default function FaqPage() {
  return (
    <PublicPageLayout title="Frequently Asked Questions">
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

        <Text as="p" variant="bodyMd" tone="subdued">
          Still have questions? Contact us at {SUPPORT_EMAIL}.
        </Text>
      </BlockStack>
    </PublicPageLayout>
  );
}
