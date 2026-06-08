import { Text, BlockStack } from "@shopify/polaris";
import { PublicPageLayout } from "../components/PublicPageLayout";
import {
  APP_NAME,
  COMPANY_NAME,
  SUPPORT_EMAIL,
  LAST_UPDATED,
} from "../lib/legal-content";

export default function TermsOfServicePage() {
  return (
    <PublicPageLayout title="Terms of Service">
      <BlockStack gap="500">
        <Text as="p" variant="bodyMd" tone="subdued">
          Last updated: {LAST_UPDATED}
        </Text>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            1. Agreement to Terms
          </Text>
          <Text as="p" variant="bodyMd">
            By installing, accessing, or using {APP_NAME} (the &quot;App&quot;), operated by {COMPANY_NAME} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not install or use the App.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            2. Description of Service
          </Text>
          <Text as="p" variant="bodyMd">
            {APP_NAME} is a Shopify application that uses artificial intelligence to generate product image alt text and SEO meta content for your store. The App provides tools to review, apply, track, and roll back changes to your product data.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            3. Eligibility
          </Text>
          <Text as="p" variant="bodyMd">
            You must be at least 18 years old and have a valid Shopify store to use the App. By using the App, you represent that you have the authority to bind your business to these Terms.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            4. Account and Credits
          </Text>
          <Text as="p" variant="bodyMd">
            Each store receives a limited number of free generation credits upon installation. Credits are consumed when you generate alt text for product images. We reserve the right to modify credit allocations, pricing, or availability at any time with reasonable notice.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            5. AI-Generated Content
          </Text>
          <Text as="p" variant="bodyMd">
            The App uses OpenAI&apos;s language models to generate alt text and SEO suggestions. AI-generated content is provided as suggestions only. You are responsible for reviewing all generated content before applying it to your store. We do not guarantee the accuracy, completeness, or suitability of AI-generated content for your specific products or legal requirements.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            6. Acceptable Use
          </Text>
          <Text as="p" variant="bodyMd">
            You agree not to:
          </Text>
          <Text as="p" variant="bodyMd">
            • Use the App for any unlawful purpose or in violation of Shopify&apos;s terms
          </Text>
          <Text as="p" variant="bodyMd">
            • Attempt to reverse engineer, decompile, or exploit the App or its underlying systems
          </Text>
          <Text as="p" variant="bodyMd">
            • Abuse credit limits or circumvent usage restrictions
          </Text>
          <Text as="p" variant="bodyMd">
            • Use the App to generate content that is harmful, misleading, or infringes on third-party rights
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            7. Intellectual Property
          </Text>
          <Text as="p" variant="bodyMd">
            The App, including its design, code, and branding, is owned by {COMPANY_NAME}. You retain ownership of your store data and product content. AI-generated alt text applied to your products becomes part of your store content.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            8. Shopify Integration
          </Text>
          <Text as="p" variant="bodyMd">
            Your use of the App is also subject to Shopify&apos;s Terms of Service and API Terms of Use. We are not responsible for changes to Shopify&apos;s platform that may affect the App&apos;s functionality.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            9. Disclaimer of Warranties
          </Text>
          <Text as="p" variant="bodyMd">
            THE APP IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT AI-GENERATED CONTENT WILL IMPROVE YOUR SEARCH RANKINGS.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            10. Limitation of Liability
          </Text>
          <Text as="p" variant="bodyMd">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY_NAME.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE APP. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID FOR THE APP IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            11. Termination
          </Text>
          <Text as="p" variant="bodyMd">
            You may stop using the App at any time by uninstalling it from your Shopify admin. We may suspend or terminate your access if you violate these Terms. Upon termination, your right to use the App ceases immediately, and we will delete your app data as described in our Privacy Policy.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            12. Changes to Terms
          </Text>
          <Text as="p" variant="bodyMd">
            We may modify these Terms at any time. Material changes will be reflected by updating the &quot;Last updated&quot; date. Continued use of the App after changes constitutes acceptance of the revised Terms.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            13. Governing Law
          </Text>
          <Text as="p" variant="bodyMd">
            These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            14. Contact
          </Text>
          <Text as="p" variant="bodyMd">
            For questions about these Terms, contact us at {SUPPORT_EMAIL}.
          </Text>
        </BlockStack>
      </BlockStack>
    </PublicPageLayout>
  );
}
