import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  List,
  Link,
  Box
} from "@shopify/polaris";

export default function AdditionalPage() {
  return (
    <Page fullWidth title="Additional page">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Multiple pages
              </Text>
              <Text as="p">
                The app template comes with an additional page which demonstrates how
                to create multiple pages within app navigation using{" "}
                <Link
                  url="https://shopify.dev/docs/apps/tools/app-bridge"
                  target="_blank"
                  removeUnderline
                >
                  App Bridge
                </Link>
                .
              </Text>
              <Text as="p">
                To create your own page and have it show up in the app navigation, add
                a page inside <code>app/routes</code>, and a link to it in the{" "}
                <code>app/routes/app.jsx</code>.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Resources
              </Text>
              <List>
                <List.Item>
                  <Link
                    url="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
                    target="_blank"
                    removeUnderline
                  >
                    App nav best practices
                  </Link>
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
