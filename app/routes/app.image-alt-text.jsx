import { Await, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { Suspense } from "react";
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
  Checkbox,
  InlineStack,
  Box,
  Banner,
  Spinner,
  useIndexResourceState,
  InlineGrid,
  Select,
  Pagination,
  Modal,
  EmptySearchResult,
  Tooltip,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import {
  CheckIcon,
  AlertCircleIcon,
  MagicIcon,
  EditIcon,
  RefreshIcon,
  DeleteIcon,
  SearchIcon,
} from "@shopify/polaris-icons";
import { getIndustryLabel, getToneLabel } from "../lib/brand-profile.js";

const FILTER_OPTIONS = [
  { label: "All product media", value: "all" },
  { label: "Missing image alt text", value: "missing_alt" },
  { label: "Has image alt text", value: "has_alt" },
  { label: "AI suggestions or published", value: "ai_generated" },
  { label: "Missing search engine listing", value: "needs_seo" },
  { label: "Failed updates", value: "failed" },
];

const REVIEW_BEFORE_SAVE_KEY = "image-alt-text-review-before-save";

const PAGE_SIZE = 25;

export const loader = async ({ request }) => {
  const {
    getProductImageAudit,
    getImageAuditCounts,
    getAllProductKeywords,
    getShopSettings,
    getShopCreditBalance,
  } = await import("../lib/seo.server");

  const { session, admin, redirect } = await authenticate.admin(request);
  const shopSettings = await getShopSettings(session.shop);

  if (!shopSettings?.onboardingCompleted) {
    throw redirect("/app/onboarding");
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";
  const query = url.searchParams.get("q") || "";
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");

  const forceRefresh = url.searchParams.get("refresh") === "1";
  const { getShopAuditCountsFromCache } = await import("../lib/seo.server");

  const countsPromise = (async () => {
    if (!forceRefresh) {
      const cached = await getShopAuditCountsFromCache(session.shop);
      if (cached) {
        return cached;
      }
    }
    return getImageAuditCounts(admin, session.shop, { forceRefresh });
  })();

  const [audit, keywords, creditBalance] = await Promise.all([
    getProductImageAudit(admin, session.shop, { filter, query, after, before, pageSize: PAGE_SIZE }),
    getAllProductKeywords(),
    getShopCreditBalance(session.shop),
  ]);

  return {
    shop: session.shop,
    productImages: audit.images,
    pageInfo: audit.pageInfo,
    counts: countsPromise,
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
    reserveProductSeoCredits,
    markAltTextCreditUsed,
    markGenerationCreditUsed,
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
  const reviewBeforeSave = formData.get("reviewBeforeSave") === "true";

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
          message: `You have ${error.availableCredits} tokens left, but this request needs ${error.requestedCredits}. Upgrade your plan to continue.`,
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
        if (!change) {
          throw new Error("Could not create alt text history record.");
        }
        const appliedChange = reviewBeforeSave
          ? null
          : await applyImageAltTextSuggestion(admin, session.shop, change.id);
        await markAltTextCreditUsed(reservation?.id, suggestedAltText);
        results.push({
          id: image.imageId,
          changeId: appliedChange?.id || change?.id,
          suggestedAltText,
          status: "success",
          applied: !reviewBeforeSave,
        });
      } catch (error) {
        await refundAltTextCredit(reservation?.id);
        results.push({ id: image.imageId, status: "error", error: error.message });
      }
    }

    const appliedCount = results.filter((result) => result.status === "success" && result.applied).length;
    const suggestedCount = results.filter((result) => result.status === "success" && !result.applied).length;

    return {
      status: "success",
      type: "alt_suggestion",
      processed: results.length,
      results,
      creditBalance: await getShopCreditBalance(session.shop),
      message: reviewBeforeSave
        ? `Created ${suggestedCount} image alt text suggestion(s). Review and apply to publish in Shopify.`
        : `Published ${appliedCount} image alt text update(s) to Shopify`,
    };
  }

  if (intent === "generate_product_seo_suggestion") {
    const product = JSON.parse(formData.get("product") || "{}");
    const shopSettings = await getShopSettings(session.shop);
    let reservation = null;

    try {
      [reservation] = await reserveProductSeoCredits(session.shop, [product]);
    } catch (error) {
      if (error instanceof CreditLimitExceededError) {
        return {
          status: "error",
          type: "seo_suggestion",
          message: `You have ${error.availableCredits} tokens left, but this request needs ${error.requestedCredits}. Upgrade your plan to continue.`,
          creditBalance: await getShopCreditBalance(session.shop),
        };
      }
      throw error;
    }

    try {
      const seo = await generateProductSEO(product.productTitle, product.productDescription, shopSettings);
      const change = await createProductSeoSuggestion(session.shop, product, seo);
      if (!change) {
        throw new Error("Could not create product SEO history record.");
      }
      const appliedChange = reviewBeforeSave
        ? null
        : await applyProductSeoSuggestion(admin, session.shop, change.id);

      await markGenerationCreditUsed(reservation?.id);

      return {
        status: "success",
        type: "seo_suggestion",
        productId: product.productId,
        changeId: appliedChange?.id || change.id,
        seo,
        applied: !reviewBeforeSave,
        creditBalance: await getShopCreditBalance(session.shop),
        message: reviewBeforeSave
          ? "Search engine listing suggestion created. Review and apply to publish in Shopify."
          : "Search engine listing published to Shopify",
      };
    } catch (error) {
      await refundAltTextCredit(reservation?.id);
      return {
        status: "error",
        type: "seo_suggestion",
        message: error.message,
        creditBalance: await getShopCreditBalance(session.shop),
      };
    }
  }

  if (intent === "generate_selected_suggestions") {
    const images = JSON.parse(formData.get("images") || "[]");
    const currentKeywordsMap = JSON.parse(formData.get("currentKeywords") || "{}");
    const uniqueImages = Array.from(new Map(images.map((image) => [image.imageId, image])).values());
    const uniqueProducts = Array.from(new Map(uniqueImages.map((image) => [image.productId, image])).values());
    const keywordsList = await getAllProductKeywords();
    const shopSettings = await getShopSettings(session.shop);
    let reservations = [];

    try {
      reservations = await reserveAltTextCredits(session.shop, uniqueImages);
    } catch (error) {
      if (error instanceof CreditLimitExceededError) {
        return {
          status: "error",
          type: "selected_suggestions",
          message: `You have ${error.availableCredits} tokens left, but this request needs ${error.requestedCredits}. Upgrade your plan to continue.`,
          creditBalance: await getShopCreditBalance(session.shop),
        };
      }
      throw error;
    }

    let seoReservations = [];

    try {
      seoReservations = await reserveProductSeoCredits(session.shop, uniqueProducts);
    } catch (error) {
      for (const reservation of reservations) {
        await refundAltTextCredit(reservation.id);
      }
      if (error instanceof CreditLimitExceededError) {
        return {
          status: "error",
          type: "selected_suggestions",
          message: `You have ${error.availableCredits} tokens left, but SEO generation needs ${error.requestedCredits} more. Upgrade your plan to continue.`,
          creditBalance: await getShopCreditBalance(session.shop),
        };
      }
      throw error;
    }

    const reservationByImageId = new Map(reservations.map((reservation) => [reservation.imageId, reservation]));
    const seoReservationByProductId = new Map(
      seoReservations.map((reservation) => [reservation.productId, reservation])
    );
    const altResults = [];
    const seoResults = [];

    for (const image of uniqueImages) {
      const reservation = reservationByImageId.get(image.imageId);
      try {
        const keywords = currentKeywordsMap[image.productId] || keywordsList.find((item) => item.productId === image.productId)?.keywords || "";
        const suggestedAltText = await generateAltText(image.url, keywords, shopSettings);
        const change = await createImageAltTextSuggestion(session.shop, image, suggestedAltText);
        if (!change) {
          throw new Error("Could not create alt text history record.");
        }
        const appliedChange = reviewBeforeSave
          ? null
          : await applyImageAltTextSuggestion(admin, session.shop, change.id);
        await markAltTextCreditUsed(reservation?.id, suggestedAltText);
        altResults.push({
          id: image.imageId,
          changeId: appliedChange?.id || change.id,
          suggestedAltText,
          status: "success",
          applied: !reviewBeforeSave,
        });
      } catch (error) {
        await refundAltTextCredit(reservation?.id);
        altResults.push({ id: image.imageId, status: "error", error: error.message });
      }
    }

    for (const product of uniqueProducts) {
      const seoReservation = seoReservationByProductId.get(product.productId);
      try {
        const seo = await generateProductSEO(product.productTitle, product.productDescription, shopSettings);
        const change = await createProductSeoSuggestion(session.shop, product, seo);
        if (!change) {
          throw new Error("Could not create product SEO history record.");
        }
        const appliedChange = reviewBeforeSave
          ? null
          : await applyProductSeoSuggestion(admin, session.shop, change.id);
        await markGenerationCreditUsed(seoReservation?.id);
        seoResults.push({
          id: product.productId,
          changeId: appliedChange?.id || change.id,
          seo,
          status: "success",
          applied: !reviewBeforeSave,
        });
      } catch (error) {
        await refundAltTextCredit(seoReservation?.id);
        seoResults.push({ id: product.productId, status: "error", error: error.message });
      }
    }

    const altSuccesses = altResults.filter((result) => result.status === "success").length;
    const seoSuccesses = seoResults.filter((result) => result.status === "success").length;

    return {
      status: "success",
      type: "selected_suggestions",
      processed: altResults.length + seoResults.length,
      altResults,
      seoResults,
      creditBalance: await getShopCreditBalance(session.shop),
      message: reviewBeforeSave
        ? `Created ${altSuccesses} image alt text and ${seoSuccesses} search engine listing suggestion(s). Review and apply to publish in Shopify.`
        : `Published ${altSuccesses} image alt text and ${seoSuccesses} search engine listing update(s) to Shopify`,
    };
  }

  if (intent === "apply_suggestions") {
    const items = JSON.parse(formData.get("items") || "[]");
    const results = [];

    for (const item of items) {
      try {
        if (item.changeType === "PRODUCT_SEO") {
          await applyProductSeoSuggestion(admin, session.shop, item.changeId);
        } else {
          await applyImageAltTextSuggestion(admin, session.shop, item.changeId);
        }
        results.push({ changeId: item.changeId, status: "success" });
      } catch (error) {
        results.push({ changeId: item.changeId, status: "error", error: error.message });
      }
    }

    const successes = results.filter((result) => result.status === "success").length;
    const failures = results.length - successes;

    return {
      status: failures > 0 && successes === 0 ? "error" : "success",
      type: "apply_suggestions",
      results,
      message: failures > 0
        ? `Published ${successes} suggestion(s) to Shopify. ${failures} could not be applied.`
        : `Published ${successes} suggestion(s) to Shopify`,
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

  if (intent === "save_alt_text") {
    const image = JSON.parse(formData.get("image") || "{}");
    const altText = formData.get("altText")?.toString() || "";
    const changeId = formData.get("changeId");

    try {
      const change = changeId
        ? await updateSuggestion(session.shop, changeId, {
            suggestedAltText: altText,
            status: "SUGGESTED",
            errorMessage: null,
          })
        : await createImageAltTextSuggestion(session.shop, image, altText);

      if (!change) {
        throw new Error("Could not save alt text change.");
      }

      await applyImageAltTextSuggestion(admin, session.shop, change.id);
      return { status: "success", type: "save_alt_text", message: "Image alt text published to Shopify" };
    } catch (error) {
      return { status: "error", type: "save_alt_text", message: error.message };
    }
  }

  if (intent === "save_product_seo") {
    const product = JSON.parse(formData.get("product") || "{}");
    const changeId = formData.get("changeId");
    const seo = {
      title: formData.get("seoTitle")?.toString() || "",
      description: formData.get("seoDescription")?.toString() || "",
    };

    try {
      const change = changeId
        ? await updateSuggestion(session.shop, changeId, {
            suggestedSeoTitle: seo.title,
            suggestedSeoDescription: seo.description,
            status: "SUGGESTED",
            errorMessage: null,
          })
        : await createProductSeoSuggestion(session.shop, product, seo);

      if (!change) {
        throw new Error("Could not save product SEO change.");
      }

      await applyProductSeoSuggestion(admin, session.shop, change.id);
      return { status: "success", type: "save_product_seo", message: "Search engine listing published to Shopify" };
    } catch (error) {
      return { status: "error", type: "save_product_seo", message: error.message };
    }
  }

  if (intent === "reject_suggestion") {
    await rejectSuggestion(session.shop, formData.get("changeId"));
    return { status: "success", type: "reject_suggestion", message: "Suggestion discarded" };
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

function shortText(value, maxLength = 120) {
  if (!value?.trim()) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function compactText(value, emptyLabel, maxLength = 92) {
  return shortText(value, maxLength) || emptyLabel;
}

function parseFormJson(formData, key, fallback) {
  if (!formData) return fallback;
  try {
    return JSON.parse(formData.get(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function CellLoadingState({ message }) {
  return (
    <Box paddingBlock="200" minHeight="72px">
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <Spinner size="small" />
        <Text as="span" variant="bodySm" breakWord>
          {message}
        </Text>
      </InlineStack>
    </Box>
  );
}

function CellTextBlock({ label, value, emptyLabel, maxLength = 120 }) {
  return (
    <BlockStack gap="050">
      <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">
        {label}
      </Text>
      <Text variant="bodySm" as="p" breakWord>
        {compactText(value, emptyLabel, maxLength)}
      </Text>
    </BlockStack>
  );
}

function isAiReadyChange(change) {
  return change?.status === "SUGGESTED" || change?.status === "APPLIED";
}

function getOptimizationStatus(change) {
  if (change?.status === "SUGGESTED") return { label: "Pending review", tone: "attention" };
  if (change?.status === "APPLIED") return { label: "Published in Shopify", tone: "success" };
  if (change?.status === "FAILED") return { label: "Failed", tone: "critical" };
  return { label: "Not generated", tone: "subdued" };
}

function AuditCountCards({ counts }) {
  const statCards = [
    ["Product media", counts.totalImages],
    ["Missing image alt text", counts.missingAltText],
    ["Optimized image alt text", counts.optimizedAltText],
    ["Missing search engine listing", counts.productsMissingSeo],
    ["AI suggestions or published", counts.aiGenerated],
  ];

  return (
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
  );
}

function AuditCountCardsSkeleton() {
  return (
    <InlineGrid columns={5} gap="300">
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index}>
          <BlockStack gap="100">
            <SkeletonBodyText lines={1} />
            <SkeletonDisplayText size="small" />
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}

export default function ImageAltText() {
  const {
    productImages,
    pageInfo,
    counts: countsPromise,
    savedKeywords,
    shopSettings,
    creditBalance: initialCreditBalance,
    filter,
    query,
  } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [productKeywords, setProductKeywords] = useState({});
  const [searchValue, setSearchValue] = useState(query);
  const [editingContent, setEditingContent] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [reviewBeforeSave, setReviewBeforeSave] = useState(false);
  const handledResponse = useRef(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(REVIEW_BEFORE_SAVE_KEY) === "true";
    setReviewBeforeSave(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(REVIEW_BEFORE_SAVE_KEY, reviewBeforeSave ? "true" : "false");
  }, [reviewBeforeSave]);

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
      setEditingContent(null);
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

  const selectedUniqueProductCount = useMemo(
    () => new Set(selectedImages.map((image) => image.productId)).size,
    [selectedImages]
  );

  const selectedTokenCost = selectedImages.length + selectedUniqueProductCount;

  const activeIntent = isLoading ? fetcher.formData?.get("intent") : null;
  const generatingAlt = activeIntent === "generate_alt_suggestions";
  const generatingSeo = activeIntent === "generate_product_seo_suggestion";
  const generatingSelected = activeIntent === "generate_selected_suggestions";
  const applyingSuggestions = activeIntent === "apply_suggestions";

  const loadingFormImages = useMemo(
    () => (isLoading ? parseFormJson(fetcher.formData, "images", []) : []),
    [fetcher.formData, isLoading],
  );
  const loadingFormProduct = useMemo(
    () => (isLoading ? parseFormJson(fetcher.formData, "product", null) : null),
    [fetcher.formData, isLoading],
  );
  const loadingImageIds = useMemo(
    () => new Set(loadingFormImages.map((image) => image.imageId)),
    [loadingFormImages],
  );
  const loadingProductIds = useMemo(
    () => new Set(loadingFormImages.map((image) => image.productId)),
    [loadingFormImages],
  );

  const pendingSuggestionsForSelected = useMemo(() => {
    const items = [];
    const seenSeoProducts = new Set();

    selectedImages.forEach((image) => {
      if (image.latestImageChange?.status === "SUGGESTED") {
        items.push({ changeId: image.latestImageChange.id, changeType: "IMAGE_ALT_TEXT" });
      }
      if (image.latestProductSeoChange?.status === "SUGGESTED" && !seenSeoProducts.has(image.productId)) {
        seenSeoProducts.add(image.productId);
        items.push({ changeId: image.latestProductSeoChange.id, changeType: "PRODUCT_SEO" });
      }
    });

    return items;
  }, [selectedImages]);

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
      reviewBeforeSave: reviewBeforeSave ? "true" : "false",
    }, { method: "POST" });
  }, [fetcher, productKeywords, reviewBeforeSave]);

  const submitGenerateSelected = useCallback((images) => {
    fetcher.submit({
      intent: "generate_selected_suggestions",
      images: JSON.stringify(images),
      currentKeywords: JSON.stringify(productKeywords),
      reviewBeforeSave: reviewBeforeSave ? "true" : "false",
    }, { method: "POST" });
  }, [fetcher, productKeywords, reviewBeforeSave]);

  const submitApplySuggestions = useCallback((items) => {
    fetcher.submit({
      intent: "apply_suggestions",
      items: JSON.stringify(items),
    }, { method: "POST" });
  }, [fetcher]);

  const submitApplySingleSuggestion = useCallback((changeId, changeType) => {
    submitApplySuggestions([{ changeId, changeType }]);
  }, [submitApplySuggestions]);

  const submitGenerateSeo = useCallback((image) => {
    fetcher.submit({
      intent: "generate_product_seo_suggestion",
      product: JSON.stringify(image),
      reviewBeforeSave: reviewBeforeSave ? "true" : "false",
    }, { method: "POST" });
  }, [fetcher, reviewBeforeSave]);

  const startAltEdit = useCallback((image) => {
    const change = image.latestImageChange?.status === "SUGGESTED" ? image.latestImageChange : null;
    const draftKey = `alt-${image.imageId}`;

    setEditingContent({
      type: "alt",
      title: "Edit image alt text",
      image,
      change,
      draftKey,
    });
    setDrafts((previous) => ({
      ...previous,
      [draftKey]: {
        altText: change?.suggestedAltText || image.altText || "",
      },
    }));
  }, []);

  const startSeoEdit = useCallback((image) => {
    const change = image.latestProductSeoChange?.status === "SUGGESTED" ? image.latestProductSeoChange : null;
    const draftKey = `seo-${image.productId}`;

    setEditingContent({
      type: "seo",
      title: "Edit search engine listing",
      image,
      change,
      draftKey,
    });
    setDrafts((previous) => ({
      ...previous,
      [draftKey]: {
        seoTitle: change?.suggestedSeoTitle || image.productSeo?.title || "",
        seoDescription: change?.suggestedSeoDescription || image.productSeo?.description || "",
      },
    }));
  }, []);

  const submitContentEdit = useCallback(() => {
    if (!editingContent) return;

    const draft = drafts[editingContent.draftKey] || {};
    if (editingContent.type === "alt") {
      fetcher.submit({
        intent: "save_alt_text",
        image: JSON.stringify(editingContent.image),
        changeId: editingContent.change?.id || "",
        altText: draft.altText || "",
      }, { method: "POST" });
      return;
    }

    fetcher.submit({
      intent: "save_product_seo",
      product: JSON.stringify(editingContent.image),
      changeId: editingContent.change?.id || "",
      seoTitle: draft.seoTitle || "",
      seoDescription: draft.seoDescription || "",
    }, { method: "POST" });
  }, [drafts, editingContent, fetcher]);

  const rowMarkup = productImages.map((image, index) => {
    const imageChange = image.latestImageChange;
    const seoChange = image.latestProductSeoChange;
    const isRowGeneratingAlt = isLoading && (
      (generatingAlt && loadingImageIds.has(image.imageId))
      || (generatingSelected && loadingImageIds.has(image.imageId))
    );
    const isRowGeneratingSeo = isLoading && (
      (generatingSeo && loadingFormProduct?.productId === image.productId)
      || (generatingSelected && loadingProductIds.has(image.productId))
    );
    const altOptimization = getOptimizationStatus(imageChange);
    const seoOptimization = getOptimizationStatus(seoChange);
    const hasPendingAltSuggestion = imageChange?.status === "SUGGESTED";
    const hasPendingSeoSuggestion = seoChange?.status === "SUGGESTED";
    const generateAltLabel = reviewBeforeSave ? "Generate suggestion" : "Generate and publish";
    const generateSeoLabel = reviewBeforeSave ? "Generate suggestion" : "Generate and publish";
    const altLoadingMessage = reviewBeforeSave
      ? "Generating image alt text suggestion"
      : "Generating and publishing image alt text";
    const seoLoadingMessage = reviewBeforeSave
      ? "Generating search engine listing suggestion"
      : "Generating and publishing search engine listing";

    return (
      <IndexTable.Row
        id={image.imageId}
        key={image.imageId}
        position={index}
        selected={selectedResources.includes(image.imageId)}
      >
        <IndexTable.Cell>
          <Box minWidth="220px" maxWidth="260px" overflowX="hidden">
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <Thumbnail source={image.url} alt={image.altText || image.productTitle} size="small" />
              <Box minWidth="0">
                <Text variant="bodyMd" fontWeight="bold" breakWord>{image.productTitle}</Text>
              </Box>
            </InlineStack>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="280px" maxWidth="340px" overflowX="hidden">
            {isRowGeneratingAlt ? (
              <CellLoadingState message={altLoadingMessage} />
            ) : (
              <BlockStack gap="300">
                <BlockStack gap="150">
                  <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">
                    Current in Shopify
                  </Text>
                  <InlineStack gap="200" blockAlign="start" wrap={false}>
                    <Box minWidth="0">
                      <Text variant="bodySm" as="p" breakWord>
                        {compactText(image.altText, "No image alt text in Shopify", 140)}
                      </Text>
                    </Box>
                    <Tooltip content="Edit image alt text">
                      <Button
                        icon={EditIcon}
                        accessibilityLabel="Edit image alt text"
                        onClick={(event) => {
                          event.stopPropagation();
                          startAltEdit(image);
                        }}
                      />
                    </Tooltip>
                  </InlineStack>
                </BlockStack>
                {hasPendingAltSuggestion ? (
                  <>
                    <Divider />
                    <BlockStack gap="150">
                      <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">
                        Suggested image alt text
                      </Text>
                      <InlineStack gap="200" blockAlign="start" wrap={false}>
                        <Box minWidth="0">
                          <Text variant="bodySm" as="p" breakWord>
                            {compactText(imageChange.suggestedAltText, "No suggestion", 140)}
                          </Text>
                        </Box>
                        <Tooltip content="Publish suggestion to Shopify">
                          <Button
                            icon={CheckIcon}
                            tone="success"
                            accessibilityLabel="Publish image alt text suggestion to Shopify"
                            onClick={(event) => {
                              event.stopPropagation();
                              submitApplySingleSuggestion(imageChange.id, "IMAGE_ALT_TEXT");
                            }}
                            loading={applyingSuggestions}
                            disabled={isLoading}
                          />
                        </Tooltip>
                      </InlineStack>
                    </BlockStack>
                  </>
                ) : null}
                <InlineStack gap="150" blockAlign="center">
                  {imageChange?.status === "FAILED" ? <Badge tone="critical" icon={AlertCircleIcon}>Failed</Badge> : null}
                  <Text variant="bodySm" tone="subdued" as="span">{formatDate(image.generatedAt || imageChange?.createdAt)}</Text>
                </InlineStack>
                {imageChange?.errorMessage ? <Text variant="bodySm" tone="critical" as="p" breakWord>{imageChange.errorMessage}</Text> : null}
              </BlockStack>
            )}
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="300px" maxWidth="360px" overflowX="hidden">
            {isRowGeneratingSeo ? (
              <CellLoadingState message={seoLoadingMessage} />
            ) : (
              <BlockStack gap="300">
                <BlockStack gap="150">
                  <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">
                    Current in Shopify
                  </Text>
                  <InlineStack gap="200" blockAlign="start" wrap={false}>
                    <Box minWidth="0">
                      <BlockStack gap="150">
                        <CellTextBlock
                          label="Page title"
                          value={image.productSeo?.title}
                          emptyLabel="No page title in Shopify"
                          maxLength={100}
                        />
                        <CellTextBlock
                          label="Meta description"
                          value={image.productSeo?.description}
                          emptyLabel="No meta description in Shopify"
                          maxLength={120}
                        />
                      </BlockStack>
                    </Box>
                    <Tooltip content="Edit search engine listing">
                      <Button
                        icon={EditIcon}
                        accessibilityLabel="Edit search engine listing"
                        onClick={(event) => {
                          event.stopPropagation();
                          startSeoEdit(image);
                        }}
                      />
                    </Tooltip>
                  </InlineStack>
                </BlockStack>
                {hasPendingSeoSuggestion ? (
                  <>
                    <Divider />
                    <BlockStack gap="150">
                      <Text variant="bodySm" fontWeight="semibold" as="p" tone="subdued">
                        Suggested search engine listing
                      </Text>
                      <BlockStack gap="150">
                        <CellTextBlock
                          label="Page title"
                          value={seoChange.suggestedSeoTitle}
                          emptyLabel="No suggested page title"
                          maxLength={100}
                        />
                        <CellTextBlock
                          label="Meta description"
                          value={seoChange.suggestedSeoDescription}
                          emptyLabel="No suggested meta description"
                          maxLength={120}
                        />
                      </BlockStack>
                      <InlineStack gap="100">
                        <Tooltip content="Publish suggestion to Shopify">
                          <Button
                            icon={CheckIcon}
                            tone="success"
                            accessibilityLabel="Publish search engine listing suggestion to Shopify"
                            onClick={(event) => {
                              event.stopPropagation();
                              submitApplySingleSuggestion(seoChange.id, "PRODUCT_SEO");
                            }}
                            loading={applyingSuggestions}
                            disabled={isLoading}
                          />
                        </Tooltip>
                      </InlineStack>
                    </BlockStack>
                  </>
                ) : null}
              </BlockStack>
            )}
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="170px">
            <BlockStack gap="200">
              <BlockStack gap="100">
                <Text variant="bodySm" fontWeight="bold" as="span">
                  Image alt text
                </Text>
                <Badge
                  tone={altOptimization.tone}
                  icon={isAiReadyChange(imageChange) ? MagicIcon : undefined}
                >
                  {altOptimization.label}
                </Badge>
              </BlockStack>
              <BlockStack gap="100">
                <Text variant="bodySm" fontWeight="bold" as="span">
                  Search engine listing
                </Text>
                <Badge
                  tone={seoOptimization.tone}
                  icon={isAiReadyChange(seoChange) ? MagicIcon : undefined}
                >
                  {seoOptimization.label}
                </Badge>
              </BlockStack>
            </BlockStack>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="200px">
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" as="p">Image alt text</Text>
                <InlineStack gap="100" wrap={false}>
                  <Button
                    icon={MagicIcon}
                    accessibilityLabel={generateAltLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      submitGenerateAlt([image]);
                    }}
                    loading={isRowGeneratingAlt}
                    disabled={isLoading || availableCredits < 1}
                  >
                    {reviewBeforeSave ? "Suggest" : "Publish"}
                  </Button>
                  {hasPendingAltSuggestion ? (
                    <>
                      <Tooltip content="Publish suggestion to Shopify">
                        <Button
                          icon={CheckIcon}
                          tone="success"
                          accessibilityLabel="Publish image alt text suggestion to Shopify"
                          onClick={(event) => {
                            event.stopPropagation();
                            submitApplySingleSuggestion(imageChange.id, "IMAGE_ALT_TEXT");
                          }}
                          loading={applyingSuggestions}
                          disabled={isLoading}
                        />
                      </Tooltip>
                      <Button icon={RefreshIcon} accessibilityLabel="Regenerate image alt text suggestion" onClick={(event) => { event.stopPropagation(); submitGenerateAlt([image]); }} disabled={isLoading || availableCredits < 1} />
                      <Button icon={DeleteIcon} accessibilityLabel="Discard image alt text suggestion" onClick={(event) => {
                        event.stopPropagation();
                        fetcher.submit({ intent: "reject_suggestion", changeId: imageChange.id }, { method: "POST" });
                      }} />
                    </>
                  ) : null}
                </InlineStack>
              </BlockStack>
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued" as="p">Search engine listing</Text>
                <InlineStack gap="100" wrap={false}>
                  <Button
                    icon={SearchIcon}
                    accessibilityLabel={generateSeoLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      submitGenerateSeo(image);
                    }}
                    loading={isRowGeneratingSeo}
                    disabled={isLoading || availableCredits < 1}
                  >
                    {reviewBeforeSave ? "Suggest" : "Publish"}
                  </Button>
                  {hasPendingSeoSuggestion ? (
                    <>
                      <Tooltip content="Publish suggestion to Shopify">
                        <Button
                          icon={CheckIcon}
                          tone="success"
                          accessibilityLabel="Publish search engine listing suggestion to Shopify"
                          onClick={(event) => {
                            event.stopPropagation();
                            submitApplySingleSuggestion(seoChange.id, "PRODUCT_SEO");
                          }}
                          loading={applyingSuggestions}
                          disabled={isLoading}
                        />
                      </Tooltip>
                      <Button icon={DeleteIcon} accessibilityLabel="Discard search engine listing suggestion" onClick={(event) => {
                        event.stopPropagation();
                        fetcher.submit({ intent: "reject_suggestion", changeId: seoChange.id }, { method: "POST" });
                      }} />
                    </>
                  ) : null}
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Box>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      fullWidth
      title="Product media and search engine listing audit"
      subtitle="Generate AI image alt text and search engine listings for your products."
    >
      <Layout>
        <Layout.Section>
          <Banner tone="success" title={`Generating as ${shopSettings?.brandName || "your brand"} · ${getToneLabel(shopSettings?.tone) || "Professional"} tone`}>
            <p>
              {getIndustryLabel(shopSettings?.industry, shopSettings?.otherIndustry)
                ? `Industry: ${getIndustryLabel(shopSettings.industry, shopSettings.otherIndustry)}. `
                : ""}
              AI alt text uses your brand profile from Settings.
              {shopSettings?.searchTerms ? ` Targeting: ${shopSettings.searchTerms}.` : ""}
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Banner
            title={reviewBeforeSave ? "Review suggestions before publishing to Shopify" : "Publish directly to Shopify"}
            tone="info"
          >
            <p>
              {reviewBeforeSave
                ? "AI creates suggestions first. Review the suggested image alt text and search engine listing, then publish to Shopify when you are ready."
                : "AI content is published directly to Shopify for the selected product media and search engine listing."}
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Suspense fallback={<AuditCountCardsSkeleton />}>
            <Await resolve={countsPromise}>
              {(counts) => <AuditCountCards counts={counts} />}
            </Await>
          </Suspense>
        </Layout.Section>

        {availableCredits === 0 ? (
          <Layout.Section>
            <Banner
              title="No generation tokens remaining"
              tone="warning"
              action={{ content: "View plans", url: "/app/billing" }}
            >
              <p>
                This store has used all {totalCredits} tokens on your current plan. Upgrade to
                continue generating alt text and SEO meta tags. Existing applied changes can still
                be edited and rolled back from history.
              </p>
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Review suggestions before publishing to Shopify"
                helpText="When enabled, AI shows suggested image alt text and search engine listing first. You can publish one row at a time or apply all selected suggestions in bulk."
                checked={reviewBeforeSave}
                onChange={setReviewBeforeSave}
              />
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
                  label="Product media filter"
                  options={FILTER_OPTIONS}
                  value={filter}
                  onChange={(value) => updateParams({ filter: value })}
                />
              </InlineGrid>
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" tone={selectedTokenCost > availableCredits ? "critical" : "subdued"}>
                  {selectedResources.length} selected ({selectedTokenCost} tokens for alt + SEO). {availableCredits}/{totalCredits} tokens available.
                </Text>
                <InlineStack gap="200">
                  {pendingSuggestionsForSelected.length > 0 ? (
                    <Button
                      icon={CheckIcon}
                      tone="success"
                      onClick={() => submitApplySuggestions(pendingSuggestionsForSelected)}
                      loading={applyingSuggestions}
                      disabled={isLoading}
                    >
                      Publish {pendingSuggestionsForSelected.length} suggestion{pendingSuggestionsForSelected.length === 1 ? "" : "s"} to Shopify
                    </Button>
                  ) : null}
                  <Button
                    icon={MagicIcon}
                    variant="primary"
                    onClick={() => submitGenerateSelected(selectedImages)}
                    loading={generatingSelected}
                    disabled={selectedImages.length === 0 || selectedTokenCost > availableCredits || isLoading}
                  >
                    {reviewBeforeSave ? "Generate suggestions" : "Generate and publish"}
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
                { title: "Product", minWidth: "220px" },
                { title: "Image alt text", minWidth: "300px" },
                { title: "Search engine listing", minWidth: "320px" },
                { title: "Optimization status", minWidth: "170px" },
                { title: "Actions", alignment: "end", minWidth: "200px" },
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
        open={Boolean(editingContent)}
        onClose={() => setEditingContent(null)}
        title={editingContent?.title || "Edit content"}
        primaryAction={{
          content: "Publish to Shopify",
          onAction: submitContentEdit,
          loading: isLoading,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setEditingContent(null) }]}
      >
        <Modal.Section>
          {editingContent ? (
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="bold">
                  {editingContent.image.productTitle}
                </Text>
                {editingContent.change ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    This starts from the current AI suggestion. Publishing will update Shopify.
                  </Text>
                ) : null}
              </BlockStack>
              {editingContent.type === "alt" ? (
                <TextField
                  label="Image alt text"
                  value={drafts[editingContent.draftKey]?.altText || ""}
                  onChange={(value) => setDrafts((previous) => ({
                    ...previous,
                    [editingContent.draftKey]: {
                      ...previous[editingContent.draftKey],
                      altText: value,
                    },
                  }))}
                  multiline={3}
                  autoComplete="off"
                />
              ) : (
                <BlockStack gap="300">
                  <TextField
                    label={`Page title (${(drafts[editingContent.draftKey]?.seoTitle || "").length}/60)`}
                    value={drafts[editingContent.draftKey]?.seoTitle || ""}
                    onChange={(value) => setDrafts((previous) => ({
                      ...previous,
                      [editingContent.draftKey]: {
                        ...previous[editingContent.draftKey],
                        seoTitle: value,
                      },
                    }))}
                    autoComplete="off"
                  />
                  <TextField
                    label={`Meta description (${(drafts[editingContent.draftKey]?.seoDescription || "").length}/160)`}
                    value={drafts[editingContent.draftKey]?.seoDescription || ""}
                    onChange={(value) => setDrafts((previous) => ({
                      ...previous,
                      [editingContent.draftKey]: {
                        ...previous[editingContent.draftKey],
                        seoDescription: value,
                      },
                    }))}
                    multiline={4}
                    autoComplete="off"
                  />
                </BlockStack>
              )}
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
