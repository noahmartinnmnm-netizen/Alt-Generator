import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import React, { useEffect, useState, useCallback } from "react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  IndexTable,
  TextField,
  Thumbnail,
  Badge,
  InlineStack,
  Box,
  Banner,
  useIndexResourceState,
  Icon,
  InlineGrid
} from "@shopify/polaris";
import {
  CheckIcon,
  AlertCircleIcon,
  SaveIcon,
  MagicIcon
} from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { 
    getAllProductImages, 
    getAllProductKeywords,
    getShopSettings
  } = await import("../lib/seo.server");

  const { session, admin } = await authenticate.admin(request);
  const productImages = await getAllProductImages(admin);
  const keywords = await getAllProductKeywords();
  const shopSettings = await getShopSettings(session.shop);

  return {
    shop: session.shop,
    productImages,
    savedKeywords: keywords,
    shopSettings
  };
};

export const action = async ({ request }) => {
  const { 
    getAllProductImages, 
    generateAltText, 
    updateImageAltText, 
    generateProductSEO, 
    updateProductSEO,
    saveProductKeywords,
    getAllProductKeywords,
    getShopSettings
  } = await import("../lib/seo.server");

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_keywords") {
    const productId = formData.get("productId");
    const keywords = formData.get("keywords");
    await saveProductKeywords(productId, keywords);
    return { status: "success", message: "Keywords saved" };
  }

  if (intent === "optimize") {
    const selectedIdsStr = formData.get("selectedIds");
    const selectedIds = selectedIdsStr ? JSON.parse(selectedIdsStr) : [];
    
    const productImages = await getAllProductImages(admin);
    const keywordsList = await getAllProductKeywords();
    const shopSettings = await getShopSettings(session.shop);
    const currentKeywordsStr = formData.get("currentKeywords");
    const currentKeywordsMap = currentKeywordsStr ? JSON.parse(currentKeywordsStr) : {};
    
    let imagesToOptimize;
    if (selectedIds.length > 0) {
      imagesToOptimize = productImages.filter(img => selectedIds.includes(img.imageId));
    } else {
      imagesToOptimize = productImages.filter(img => !img.altText || img.altText.trim() === "").slice(0, 5);
    }
    
    const results = [];

    for (const image of imagesToOptimize) {
      try {
        const productKeywords = currentKeywordsMap[image.productId] || keywordsList.find(k => k.productId === image.productId)?.keywords || "";
        const altText = await generateAltText(image.url, productKeywords, shopSettings);
        const response = await updateImageAltText(admin, image.productId, image.imageId, altText);
        
        if (response.data?.productUpdateMedia?.userErrors?.length > 0) {
          results.push({ id: image.imageId, status: "error", error: response.data.productUpdateMedia.userErrors[0].message });
        } else {
          results.push({ id: image.imageId, altText, status: "success" });
        }
      } catch (error) {
        results.push({ id: image.imageId, status: "error", error: error.message });
      }
    }

    return { results, processed: results.length, type: "alt" };
  }

  if (intent === "optimize_seo") {
    const productImages = await getAllProductImages(admin);
    const shopSettings = await getShopSettings(session.shop);
    const uniqueProducts = Array.from(new Set(productImages.map(p => p.productId)))
      .map(id => productImages.find(p => p.productId === id))
      .filter(p => !p.productSeo?.title || !p.productSeo?.description)
      .slice(0, 3);

    const results = [];
    for (const product of uniqueProducts) {
      try {
        const seo = await generateProductSEO(product.productTitle, product.productDescription, shopSettings);
        const response = await updateProductSEO(admin, product.productId, seo.title, seo.description);
        
        if (response.data?.productUpdate?.userErrors?.length > 0) {
          results.push({ id: product.productId, status: "error", error: response.data.productUpdate.userErrors[0].message });
        } else {
          results.push({ id: product.productId, seo, status: "success" });
        }
      } catch (error) {
        results.push({ id: product.productId, status: "error", error: error.message });
      }
    }
    return { results, processed: results.length, type: "seo" };
  }

  return null;
};

export default function ImageAltText() {
  const { productImages, savedKeywords } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [isProcessing, setIsProcessing] = useState(false);
  const [productKeywords, setProductKeywords] = useState({});

  useEffect(() => {
    const kwMap = {};
    savedKeywords.forEach(k => {
      kwMap[k.productId] = k.keywords;
    });
    setProductKeywords(kwMap);
  }, [savedKeywords]);

  const isLoading = fetcher.state !== "idle";
  const imagesWithoutAltCount = productImages.filter(img => !img.altText || img.altText.trim() === "").length;
  const productsWithoutSeoCount = Array.from(new Set(productImages.map(p => p.productId)))
    .map(id => productImages.find(p => p.productId === id))
    .filter(p => !p.productSeo?.title || !p.productSeo?.description).length;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.processed) {
      const type = fetcher.data.type === "alt" ? "alt texts" : "product SEO metas";
      shopify.toast.show(`Processed ${fetcher.data.processed} ${type}`);
      setIsProcessing(false);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const handleOptimize = (ids = []) => {
    setIsProcessing(true);
    fetcher.submit({ 
      intent: "optimize",
      currentKeywords: JSON.stringify(productKeywords),
      selectedIds: JSON.stringify(ids)
    }, { method: "POST" });
  };

  const handleOptimizeSEO = () => {
    setIsProcessing(true);
    fetcher.submit({ intent: "optimize_seo" }, { method: "POST" });
  };

  const handleKeywordChange = useCallback((productId, value) => {
    setProductKeywords(prev => ({ ...prev, [productId]: value }));
  }, []);

  const resourceName = {
    singular: 'product image',
    plural: 'product images',
  };

  const {selectedResources, allResourcesSelected, handleSelectionChange} =
    useIndexResourceState(productImages, {
      resourceIDResolver: (image) => image.imageId,
    });

  const promotedBulkActions = [
    {
      content: 'Generate Alt Tags',
      onAction: () => handleOptimize(selectedResources),
    },
  ];

  const rowMarkup = productImages.map((image, index) => {
    const optAlt = fetcher.data?.type === "alt" && fetcher.data?.results?.find(r => r.id === image.imageId);
    const optSeo = fetcher.data?.type === "seo" && fetcher.data?.results?.find(r => r.id === image.productId);
    
    const currentAltText = optAlt?.altText || image.altText;
    const hasSeo = (image.productSeo?.title && image.productSeo?.description) || optSeo?.status === "success";

    return (
      <IndexTable.Row 
        id={image.imageId} 
        key={image.imageId} 
        position={index}
        selected={selectedResources.includes(image.imageId)}
      >
        <IndexTable.Cell>
          <Thumbnail
            source={image.url}
            alt={currentAltText || image.productTitle}
            size="small"
          />
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="150px">
            <Text variant="bodyMd" fontWeight="bold" truncate>
              {image.productTitle}
            </Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {currentAltText ? (
            <div style={{ whiteSpace: "nowrap" }}>
              <Text variant="bodySm" as="span">
                {currentAltText}
              </Text>
            </div>
          ) : (
            <Badge tone="attention">Missing</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="120px">
            {hasSeo ? (
              <Badge tone="success" icon={CheckIcon}>Optimized</Badge>
            ) : (
              <Badge tone="attention" icon={AlertCircleIcon}>Needs SEO</Badge>
            )}
          </Box>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page 
      fullWidth 
      title="Image Alt Text Optimization" 
      subtitle="Boost your search visibility with AI-powered alt text and SEO metadata."
    >
      <Layout>
        <Layout.Section>
          <Banner title="Optimization Overview" tone="info">
            <p>Use AI to automatically generate search-friendly alt text for your images and SEO metadata for your products.</p>
          </Banner>
        </Layout.Section>
        
        <Layout.Section>
          <InlineGrid columns={2} gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Image Alt Text
                </Text>
                <Text as="p" color="subdued">
                  Select images below and use "Generate Alt Tags" to optimize them using AI.
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodyLg" fontWeight="bold">
                    {imagesWithoutAltCount} Missing
                  </Text>
                  <Button
                    variant="primary"
                    icon={MagicIcon}
                    onClick={() => handleOptimize()}
                    loading={isLoading && fetcher.formData?.get("intent") === "optimize" && !fetcher.formData?.get("selectedIds")}
                    disabled={imagesWithoutAltCount === 0}
                  >
                    Quick Optimize (Top 5)
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Product Meta SEO
                </Text>
                <Text as="p" color="subdued">
                  AI-generated titles and descriptions designed to increase click-through rates.
                </Text>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodyLg" fontWeight="bold">
                    {productsWithoutSeoCount} Missing
                  </Text>
                  <Button
                    icon={MagicIcon}
                    onClick={handleOptimizeSEO}
                    loading={isLoading && fetcher.formData?.get("intent") === "optimize_seo"}
                    disabled={productsWithoutSeoCount === 0}
                  >
                    Optimize Meta
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={productImages.length}
              selectedItemsCount={
                allResourcesSelected ? 'All' : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: 'Image' },
                { title: 'Product', minWidth: '150px' },
                { title: 'Alt Text', minWidth: '250px' },
                { title: 'SEO Status', minWidth: '120px' },
              ]}
              promotedBulkActions={promotedBulkActions}
              lastColumnSticky
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
