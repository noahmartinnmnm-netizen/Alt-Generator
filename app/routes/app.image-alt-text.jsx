import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Spinner,
  useIndexResourceState,
  InlineGrid,
  Select,
  Pagination,
  Modal,
  Divider,
  EmptySearchResult,
} from "@shopify/polaris";
import {
  CheckIcon,
  AlertCircleIcon,
  SaveIcon,
  MagicIcon,
  EditIcon,
  XIcon,
  RefreshIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";

const FILTER_OPTIONS = [
  { label: "All images", value: "all" },
  { label: "Missing alt text", value: "missing_alt" },
  { label: "Has alt text", value: "has_alt" },
  { label: "AI generated", value: "ai_generated" },
  { label: "Needs product SEO", value: "needs_seo" },
  { label: "Failed/errored", value: "failed" },
];

const PAGE_SIZE = 25;

export const loader = async ({ request }) => {
  const {
    getProductImageAudit,
    getImageAuditCounts,
    getAllProductKeywords,
    getShopSettings,
    getShopCreditBalance,
  } = await import("../lib/seo.server");

  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";
  const query = url.searchParams.get("q") || "";
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");

  const [audit, counts, keywords, shopSettings, creditBalance] = await Promise.all([
    getProductImageAudit(admin, session.shop, { filter, query, after, before, pageSize: PAGE_SIZE }),
    getImageAuditCounts(admin, session.shop),
    getAllProductKeywords(),
    getShopSettings(session.shop),
    getShopCreditBalance(session.shop),
  ]);

  return {
    shop: session.shop,
    productImages: audit.images,
    pageInfo: audit.pageInfo,
    counts,
    savedKeywords: keywords,
    shopSettings,
    creditBalance,
    filter,
    query,
  };
};

export const action = async ({ request }) => {
  const {
    generateAltText,
    generateProductSEO,
    reserveAltTextCredits,
    markAltTextCreditUsed,
    refundAltTextCredit,
    getShopCreditBalance,
    getShopSettings,
    getAllProductKeywords,
    CreditLimitExceededError,
    createImageAltTextSuggestion,
    createProductSeoSuggestion,
    updateSuggestion,
    rejectSuggestion,
    applyImageAltTextSuggestion,
    applyProductSeoSuggestion,
  } = await import("../lib/seo.server");

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "generate_alt_suggestions") {
    const images = JSON.parse(formData.get("images") || "[]");
    const currentKeywordsMap = JSON.parse(formData.get("currentKeywords") || "{}");
    const uniqueImages = Array.from(new Map(images.map((image) => [image.imageId, image])).values());
    const keywordsList = await getAllProductKeywords();
    const shopSettings = await getShopSettings(session.shop);
    let reservations = [];

    try {
      reservations = await reserveAltTextCredits(session.shop, uniqueImages);
    } catch (error) {
      if (error instanceof CreditLimitExceededError) {
        return {
          status: "error",
          type: "alt_suggestion",
          message: `You have ${error.availableCredits} credits left, but this request needs ${error.requestedCredits}.`,
          creditBalance: await getShopCreditBalance(session.shop),
        };
      }
      throw error;
    }

    const reservationByImageId = new Map(reservations.map((reservation) => [reservation.imageId, reservation]));
    const results = [];

    for (const image of uniqueImages) {
      const reservation = reservationByImageId.get(image.imageId);
      try {
        const keywords = currentKeywordsMap[image.productId] || keywordsList.find((item) => item.productId === image.productId)?.keywords || "";
        const suggestedAltText = await generateAltText(image.url, keywords, shopSettings);
        const change = await createImageAltTextSuggestion(session.shop, image, suggestedAltText);
        await markAltTextCreditUsed(reservation?.id, suggestedAltText);
        results.push({ id: image.imageId, changeId: change?.id, suggestedAltText, status: "success" });
      } catch (error) {
        await refundAltTextCredit(reservation?.id);
        results.push({ id: image.imageId, status: "error", error: error.message });
      }
    }

    return {
      status: "success",
      type: "alt_suggestion",
      processed: results.length,
      results,
      creditBalance: await getShopCreditBalance(session.shop),
    };
  }

  if (intent === "generate_product_seo_suggestion") {
    const product = JSON.parse(formData.get("product") || "{}");
    const shopSettings = await getShopSettings(session.shop);
    const seo = await generateProductSEO(product.productTitle, product.productDescription, shopSettings);
    const change = await createProductSeoSuggestion(session.shop, product, seo);

    return {
      status: "success",
      type: "seo_suggestion",
      productId: product.productId,
      changeId: change?.id,
      seo,
      message: "Product SEO suggestion generated",
    };
  }

  if (intent === "edit_suggestion") {
    const id = formData.get("changeId");
    const changeType = formData.get("changeType");

    if (changeType === "PRODUCT_SEO") {
      await updateSuggestion(session.shop, id, {
        suggestedSeoTitle: formData.get("suggestedSeoTitle")?.toString() || "",
        suggestedSeoDescription: formData.get("suggestedSeoDescription")?.toString() || "",
        status: "SUGGESTED",
        errorMessage: null,
      });
    } else {
      await updateSuggestion(session.shop, id, {
        suggestedAltText: formData.get("suggestedAltText")?.toString() || "",
        status: "SUGGESTED",
        errorMessage: null,
      });
    }

    return { status: "success", type: "edit_suggestion", message: "Suggestion saved" };
  }

  if (intent === "reject_suggestion") {
    await rejectSuggestion(session.shop, formData.get("changeId"));
    return { status: "success", type: "reject_suggestion", message: "Suggestion discarded" };
  }

  if (intent === "apply_suggestion") {
    const changeType = formData.get("changeType");
    try {
      const change = changeType === "PRODUCT_SEO"
        ? await applyProductSeoSuggestion(admin, session.shop, formData.get("changeId"))
        : await applyImageAltTextSuggestion(admin, session.shop, formData.get("changeId"));

      return {
        status: "success",
        type: "apply_suggestion",
        change,
        message: "Suggestion applied to Shopify",
      };
    } catch (error) {
      return {
        status: "error",
        type: "apply_suggestion",
        message: error.message,
      };
    }
  }

  if (intent === "apply_selected_suggestions") {
    const suggestions = JSON.parse(formData.get("suggestions") || "[]");
    const results = [];

    for (const suggestion of suggestions) {
      try {
        const change = suggestion.changeType === "PRODUCT_SEO"
          ? await applyProductSeoSuggestion(admin, session.shop, suggestion.id)
          : await applyImageAltTextSuggestion(admin, session.shop, suggestion.id);
        results.push({ id: suggestion.id, status: "success", change });
      } catch (error) {
        results.push({ id: suggestion.id, status: "error", error: error.message });
      }
    }

    return {
      status: "success",
      type: "apply_selected_suggestions",
      processed: results.length,
      results,
      message: `Applied ${results.filter((result) => result.status === "success").length} suggestion(s)`,
    };
  }

  return { status: "error", message: "Unsupported action" };
};

function formatDate(value) {
  if (!value) return "Not generated";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function suggestionStatusBadge(change) {
  if (!change) return <Badge tone="subdued">No suggestion</Badge>;
  if (change.status === "APPLIED") return <Badge tone="success" icon={CheckIcon}>Applied</Badge>;
  if (change.status === "FAILED") return <Badge tone="critical" icon={AlertCircleIcon}>Failed</Badge>;
  if (change.status === "REJECTED") return <Badge tone="subdued">Rejected</Badge>;
  if (change.status === "ROLLED_BACK") return <Badge tone="attention">Rolled back</Badge>;
  return <Badge tone="info" icon={MagicIcon}>Suggested</Badge>;
}

export default function ImageAltText() {
  const {
    productImages,
    pageInfo,
    counts,
    savedKeywords,
    creditBalance: initialCreditBalance,
    filter,
    query,
  } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [productKeywords, setProductKeywords] = useState({});
  const [searchValue, setSearchValue] = useState(query);
  const [editingChangeId, setEditingChangeId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [bulkApplyOpen, setBulkApplyOpen] = useState(false);
  const handledResponse = useRef(null);

  useEffect(() => {
    const kwMap = {};
    savedKeywords.forEach((item) => {
      kwMap[item.productId] = item.keywords;
    });
    setProductKeywords(kwMap);
  }, [savedKeywords]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handledResponse.current === fetcher.data) {
      return;
    }

    handledResponse.current = fetcher.data;
    if (fetcher.data.status === "error") {
      shopify.toast.show(fetcher.data.message || "Could not complete action", { isError: true });
    } else {
      shopify.toast.show(fetcher.data.message || "Action completed");
      setEditingChangeId(null);
      setBulkApplyOpen(false);
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const isLoading = fetcher.state !== "idle";
  const creditBalance = fetcher.data?.creditBalance || initialCreditBalance;
  const availableCredits = creditBalance?.availableCredits ?? 0;
  const totalCredits = creditBalance?.totalCredits ?? 30;

  const resourceName = {
    singular: "product image",
    plural: "product images",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, removeSelectedResources } =
    useIndexResourceState(productImages, {
      resourceIDResolver: (image) => image.imageId,
    });

  const selectedImages = useMemo(
    () => productImages.filter((image) => selectedResources.includes(image.imageId)),
    [productImages, selectedResources]
  );

  const selectedPendingSuggestions = useMemo(
    () => selectedImages
      .map((image) => image.latestImageChange)
      .filter((change) => change?.status === "SUGGESTED")
      .map((change) => ({ id: change.id, changeType: change.changeType })),
    [selectedImages]
  );

  const generatingAlt = isLoading && fetcher.formData?.get("intent") === "generate_alt_suggestions";
  const applyingBulk = isLoading && fetcher.formData?.get("intent") === "apply_selected_suggestions";

  const updateParams = useCallback((updates) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("after");
    nextParams.delete("before");

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }
    });

    setSearchParams(nextParams);
    removeSelectedResources(selectedResources);
  }, [removeSelectedResources, searchParams, selectedResources, setSearchParams]);

  const goToPage = useCallback((direction, cursor) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("after");
    nextParams.delete("before");
    nextParams.set(direction, cursor);
    setSearchParams(nextParams);
    removeSelectedResources(selectedResources);
  }, [removeSelectedResources, searchParams, selectedResources, setSearchParams]);

  const submitGenerateAlt = useCallback((images) => {
    fetcher.submit({
      intent: "generate_alt_suggestions",
      images: JSON.stringify(images),
      currentKeywords: JSON.stringify(productKeywords),
    }, { method: "POST" });
  }, [fetcher, productKeywords]);

  const submitApplyBulk = useCallback(() => {
    fetcher.submit({
      intent: "apply_selected_suggestions",
      suggestions: JSON.stringify(selectedPendingSuggestions),
    }, { method: "POST" });
  }, [fetcher, selectedPendingSuggestions]);

  const startEdit = useCallback((change) => {
    setEditingChangeId(change.id);
    setDrafts((previous) => ({
      ...previous,
      [change.id]: {
        suggestedAltText: change.suggestedAltText || "",
        suggestedSeoTitle: change.suggestedSeoTitle || "",
        suggestedSeoDescription: change.suggestedSeoDescription || "",
      },
    }));
  }, []);

  const submitEdit = useCallback((change) => {
    const draft = drafts[change.id] || {};
    fetcher.submit({
      intent: "edit_suggestion",
      changeId: change.id,
      changeType: change.changeType,
      suggestedAltText: draft.suggestedAltText || "",
      suggestedSeoTitle: draft.suggestedSeoTitle || "",
      suggestedSeoDescription: draft.suggestedSeoDescription || "",
    }, { method: "POST" });
  }, [drafts, fetcher]);

  const statCards = [
    ["Total images", counts.totalImages],
    ["Missing alt text", counts.missingAltText],
    ["Optimized alt text", counts.optimizedAltText],
    ["Products missing SEO", counts.productsMissingSeo],
    ["AI-generated", counts.aiGenerated],
  ];

  const rowMarkup = productImages.map((image, index) => {
    const imageChange = image.latestImageChange;
    const seoChange = image.latestProductSeoChange;
    const hasAlt = Boolean(image.altText?.trim());
    const hasSeo = Boolean(image.productSeo?.title && image.productSeo?.description);
    const isEditing = editingChangeId === imageChange?.id || editingChangeId === seoChange?.id;
    const isRowGenerating = generatingAlt && fetcher.formData?.get("images")?.includes(image.imageId);
    const draft = drafts[imageChange?.id] || {};
    const seoDraft = drafts[seoChange?.id] || {};

    return (
      <IndexTable.Row
        id={image.imageId}
        key={image.imageId}
        position={index}
        selected={selectedResources.includes(image.imageId)}
      >
        <IndexTable.Cell>
          <Thumbnail source={image.url} alt={image.altText || image.productTitle} size="small" />
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="180px">
            <BlockStack gap="100">
              <Text variant="bodyMd" fontWeight="bold" truncate>{image.productTitle}</Text>
              {hasSeo ? (
                <Badge tone="success" icon={CheckIcon}>SEO set</Badge>
              ) : (
                <Badge tone="attention" icon={AlertCircleIcon}>Needs SEO</Badge>
              )}
            </BlockStack>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="200">
            {hasAlt ? <Badge tone="success">Has alt text</Badge> : <Badge tone="attention">Missing alt text</Badge>}
            <Box minWidth="260px">
              <Text variant="bodySm" as="p">{image.altText || "No current alt text"}</Text>
            </Box>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="320px">
            {isRowGenerating ? (
              <InlineStack gap="200" blockAlign="center">
                <Spinner size="small" />
                <Text as="span" variant="bodySm">Generating suggestion</Text>
              </InlineStack>
            ) : imageChange?.status === "SUGGESTED" && isEditing ? (
              <BlockStack gap="200">
                <TextField
                  label="Suggested alt text"
                  value={draft.suggestedAltText ?? imageChange.suggestedAltText ?? ""}
                  onChange={(value) => setDrafts((previous) => ({
                    ...previous,
                    [imageChange.id]: { ...previous[imageChange.id], suggestedAltText: value },
                  }))}
                  multiline={2}
                  autoComplete="off"
                />
                <InlineStack gap="200">
                  <Button icon={SaveIcon} onClick={() => submitEdit(imageChange)} loading={isLoading}>Save</Button>
                  <Button icon={XIcon} onClick={() => setEditingChangeId(null)}>Cancel</Button>
                </InlineStack>
              </BlockStack>
            ) : (
              <BlockStack gap="200">
                {suggestionStatusBadge(imageChange)}
                <Text variant="bodySm" as="p">{imageChange?.suggestedAltText || imageChange?.appliedAltText || "Generate a suggestion before applying changes."}</Text>
                {imageChange?.errorMessage ? <Text variant="bodySm" tone="critical" as="p">{imageChange.errorMessage}</Text> : null}
              </BlockStack>
            )}
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="170px">
            <Text variant="bodySm" as="span">{formatDate(image.generatedAt || imageChange?.createdAt)}</Text>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="330px">
            {seoChange?.status === "SUGGESTED" && isEditing ? (
              <BlockStack gap="200">
                <TextField
                  label={`Suggested SEO title (${(seoDraft.suggestedSeoTitle ?? seoChange.suggestedSeoTitle ?? "").length}/60)`}
                  value={seoDraft.suggestedSeoTitle ?? seoChange.suggestedSeoTitle ?? ""}
                  onChange={(value) => setDrafts((previous) => ({
                    ...previous,
                    [seoChange.id]: { ...previous[seoChange.id], suggestedSeoTitle: value },
                  }))}
                  autoComplete="off"
                />
                <TextField
                  label={`Suggested SEO description (${(seoDraft.suggestedSeoDescription ?? seoChange.suggestedSeoDescription ?? "").length}/160)`}
                  value={seoDraft.suggestedSeoDescription ?? seoChange.suggestedSeoDescription ?? ""}
                  onChange={(value) => setDrafts((previous) => ({
                    ...previous,
                    [seoChange.id]: { ...previous[seoChange.id], suggestedSeoDescription: value },
                  }))}
                  multiline={3}
                  autoComplete="off"
                />
                <InlineStack gap="200">
                  <Button icon={SaveIcon} onClick={() => submitEdit(seoChange)} loading={isLoading}>Save</Button>
                  <Button icon={XIcon} onClick={() => setEditingChangeId(null)}>Cancel</Button>
                </InlineStack>
              </BlockStack>
            ) : (
              <BlockStack gap="200">
                {suggestionStatusBadge(seoChange)}
                <Text variant="bodySm" as="p">Current: {image.productSeo?.title || "No SEO title"}</Text>
                <Text variant="bodySm" tone="subdued" as="p">{image.productSeo?.description || "No SEO description"}</Text>
                {seoChange ? (
                  <Box borderColor="border" borderWidth="025" borderRadius="100" padding="200">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="success" as="p">{seoChange.suggestedSeoTitle || seoChange.appliedSeoTitle}</Text>
                      <Text variant="bodySm" tone="subdued" as="p">{seoChange.suggestedSeoDescription || seoChange.appliedSeoDescription}</Text>
                    </BlockStack>
                  </Box>
                ) : null}
              </BlockStack>
            )}
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" wrap={false}>
            <Button
              icon={MagicIcon}
              accessibilityLabel="Generate alt text suggestion"
              onClick={(event) => {
                event.stopPropagation();
                submitGenerateAlt([image]);
              }}
              loading={isRowGenerating}
              disabled={isLoading || availableCredits < 1}
            />
            {imageChange?.status === "SUGGESTED" ? (
              <>
                <Button icon={EditIcon} accessibilityLabel="Edit suggestion" onClick={(event) => { event.stopPropagation(); startEdit(imageChange); }} />
                <Button icon={CheckIcon} accessibilityLabel="Apply suggestion" onClick={(event) => {
                  event.stopPropagation();
                  fetcher.submit({ intent: "apply_suggestion", changeId: imageChange.id, changeType: imageChange.changeType }, { method: "POST" });
                }} loading={isLoading && fetcher.formData?.get("changeId") === String(imageChange.id)} />
                <Button icon={RefreshIcon} accessibilityLabel="Regenerate suggestion" onClick={(event) => { event.stopPropagation(); submitGenerateAlt([image]); }} disabled={isLoading || availableCredits < 1} />
                <Button icon={DeleteIcon} accessibilityLabel="Discard suggestion" onClick={(event) => {
                  event.stopPropagation();
                  fetcher.submit({ intent: "reject_suggestion", changeId: imageChange.id }, { method: "POST" });
                }} />
              </>
            ) : null}
            <Button
              icon={MagicIcon}
              accessibilityLabel="Generate product SEO suggestion"
              onClick={(event) => {
                event.stopPropagation();
                fetcher.submit({ intent: "generate_product_seo_suggestion", product: JSON.stringify(image) }, { method: "POST" });
              }}
              disabled={isLoading}
            />
            {seoChange?.status === "SUGGESTED" ? (
              <>
                <Button icon={EditIcon} accessibilityLabel="Edit SEO suggestion" onClick={(event) => { event.stopPropagation(); startEdit(seoChange); }} />
                <Button icon={CheckIcon} accessibilityLabel="Apply SEO suggestion" onClick={(event) => {
                  event.stopPropagation();
                  fetcher.submit({ intent: "apply_suggestion", changeId: seoChange.id, changeType: seoChange.changeType }, { method: "POST" });
                }} />
              </>
            ) : null}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      fullWidth
      title="Image and Product SEO Audit"
      subtitle="Generate AI suggestions, review them, then explicitly apply approved changes to Shopify."
    >
      <Layout>
        <Layout.Section>
          <Banner title="AI suggestions require approval" tone="info">
            <p>Generating AI content stores a suggestion in this app. Shopify content is updated only after you apply the suggestion.</p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={5} gap="300">
            {statCards.map(([label, value]) => (
              <Card key={label}>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
                  <Text as="p" variant="headingLg">{value}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>

        {availableCredits === 0 ? (
          <Layout.Section>
            <Banner title="No AI credits remaining" tone="warning">
              <p>This store has used all {totalCredits} included generation credits. Existing suggestions can still be edited, applied, discarded, and rolled back from history.</p>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineGrid columns={["twoThirds", "oneThird"]} gap="300">
                <TextField
                  label="Search products"
                  value={searchValue}
                  onChange={setSearchValue}
                  onBlur={() => updateParams({ q: searchValue })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") updateParams({ q: searchValue });
                  }}
                  placeholder="Search by product title"
                  autoComplete="off"
                />
                <Select
                  label="Audit filter"
                  options={FILTER_OPTIONS}
                  value={filter}
                  onChange={(value) => updateParams({ filter: value })}
                />
              </InlineGrid>
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" tone={selectedResources.length > availableCredits ? "critical" : "subdued"}>
                  {selectedResources.length} selected. {availableCredits}/{totalCredits} generation credits available.
                </Text>
                <InlineStack gap="200">
                  <Button
                    icon={MagicIcon}
                    variant="primary"
                    onClick={() => submitGenerateAlt(selectedImages)}
                    loading={generatingAlt}
                    disabled={selectedImages.length === 0 || selectedImages.length > availableCredits || isLoading}
                  >
                    Generate suggestions
                  </Button>
                  <Button
                    icon={CheckIcon}
                    onClick={() => setBulkApplyOpen(true)}
                    disabled={selectedPendingSuggestions.length === 0 || isLoading}
                  >
                    Apply approved
                  </Button>
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={productImages.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              emptyState={<EmptySearchResult title="No images found" description="Try another filter, search term, or page." withIllustration />}
              headings={[
                { title: "Image" },
                { title: "Product", minWidth: "180px" },
                { title: "Current alt text", minWidth: "260px" },
                { title: "AI alt suggestion", minWidth: "320px" },
                { title: "Generated/applied", minWidth: "170px" },
                { title: "Product SEO", minWidth: "330px" },
                { title: "Actions", alignment: "end" },
              ]}
              lastColumnSticky
            >
              {rowMarkup}
            </IndexTable>
            <Box padding="400">
              <InlineStack align="center">
                <Pagination
                  hasPrevious={pageInfo.hasPreviousPage}
                  hasNext={pageInfo.hasNextPage}
                  onPrevious={() => goToPage("before", pageInfo.startCursor)}
                  onNext={() => goToPage("after", pageInfo.endCursor)}
                />
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={bulkApplyOpen}
        onClose={() => setBulkApplyOpen(false)}
        title="Apply selected suggestions?"
        primaryAction={{
          content: "Apply suggestions",
          onAction: submitApplyBulk,
          loading: applyingBulk,
          destructive: false,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setBulkApplyOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              This will update Shopify for {selectedPendingSuggestions.length} selected approved suggestion(s).
            </Text>
            <Divider />
            <Text as="p" tone="subdued">
              Existing merchant content will be replaced only for these selected rows. Applied changes remain available in history for rollback.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
