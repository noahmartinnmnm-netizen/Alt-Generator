import { Text, BlockStack } from "@shopify/polaris";
import { PublicPageLayout } from "../components/PublicPageLayout";
import {
  APP_NAME,
  COMPANY_NAME,
  SUPPORT_EMAIL,
  LAST_UPDATED,
} from "../lib/legal-content";

export default function PrivacyPolicyPage() {
  return (
    <PublicPageLayout title="Privacy Policy">
      <BlockStack gap="500">
        <Text as="p" variant="bodyMd" tone="subdued">
          Last updated: {LAST_UPDATED}
        </Text>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            1. Introduction
          </Text>
          <Text as="p" variant="bodyMd">
            {COMPANY_NAME} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the {APP_NAME} Shopify application (the &quot;App&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you install and use the App.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            2. Information We Collect
          </Text>
          <Text as="p" variant="bodyMd">
            When you install and use {APP_NAME}, we may collect the following information:
          </Text>
          <Text as="p" variant="bodyMd">
            <strong>Shop and account information:</strong> Your Shopify store domain, access tokens, and basic session data required to authenticate with Shopify.
          </Text>
          <Text as="p" variant="bodyMd">
            <strong>Product and image data:</strong> Product titles, image URLs, existing alt text, and SEO meta fields from your Shopify store, accessed only to provide the App&apos;s features.
          </Text>
          <Text as="p" variant="bodyMd">
            <strong>Brand profile settings:</strong> Information you provide during onboarding or in settings, including industry, brand name, tone of voice, tagline, value propositions, and SEO keywords.
          </Text>
          <Text as="p" variant="bodyMd">
            <strong>Usage data:</strong> Credit usage, generation history, applied and suggested changes, and timestamps related to your use of the App.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            3. How We Use Your Information
          </Text>
          <Text as="p" variant="bodyMd">
            We use the information we collect to:
          </Text>
          <Text as="p" variant="bodyMd">
            • Provide, operate, and maintain the App&apos;s AI alt text and SEO generation features
          </Text>
          <Text as="p" variant="bodyMd">
            • Apply approved changes to your Shopify product images and SEO fields
          </Text>
          <Text as="p" variant="bodyMd">
            • Track credit usage and maintain change history with rollback support
          </Text>
          <Text as="p" variant="bodyMd">
            • Improve the App&apos;s functionality and user experience
          </Text>
          <Text as="p" variant="bodyMd">
            • Respond to your support requests and communicate about the App
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            4. Third-Party Services
          </Text>
          <Text as="p" variant="bodyMd">
            <strong>OpenAI:</strong> When you generate alt text or SEO content, product image URLs and relevant brand profile data are sent to OpenAI&apos;s API (GPT-4o-mini) for processing. OpenAI&apos;s use of data is governed by their privacy policy at openai.com/policies/privacy-policy.
          </Text>
          <Text as="p" variant="bodyMd">
            <strong>Shopify:</strong> The App integrates with Shopify&apos;s platform. Your use of Shopify is subject to Shopify&apos;s privacy policy and terms of service.
          </Text>
          <Text as="p" variant="bodyMd">
            <strong>Hosting:</strong> App data is stored on secure cloud infrastructure. We do not sell your personal or store data to third parties.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            5. Data Retention
          </Text>
          <Text as="p" variant="bodyMd">
            We retain your data for as long as the App is installed on your store. When you uninstall the App, we delete your session data, shop settings, credit records, change history, and cached data from our servers. Alt text and SEO changes already applied to your Shopify products remain in your store.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            6. Data Security
          </Text>
          <Text as="p" variant="bodyMd">
            We implement appropriate technical and organizational measures to protect your data, including encrypted connections (HTTPS) and secure storage of Shopify access tokens. However, no method of transmission over the Internet is 100% secure.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            7. Your Rights
          </Text>
          <Text as="p" variant="bodyMd">
            Depending on your location, you may have rights to access, correct, delete, or restrict the processing of your personal data. To exercise these rights, contact us at {SUPPORT_EMAIL}. You may also uninstall the App at any time through your Shopify admin, which triggers deletion of your app data from our servers.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            8. Children&apos;s Privacy
          </Text>
          <Text as="p" variant="bodyMd">
            The App is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            9. Changes to This Policy
          </Text>
          <Text as="p" variant="bodyMd">
            We may update this Privacy Policy from time to time. We will notify you of material changes by updating the &quot;Last updated&quot; date at the top of this page. Continued use of the App after changes constitutes acceptance of the updated policy.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            10. Contact Us
          </Text>
          <Text as="p" variant="bodyMd">
            If you have questions about this Privacy Policy, please contact us at {SUPPORT_EMAIL}.
          </Text>
        </BlockStack>
      </BlockStack>
    </PublicPageLayout>
  );
}
