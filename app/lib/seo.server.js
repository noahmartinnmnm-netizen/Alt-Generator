import OpenAI from "openai";
import prisma from "../db.server";
import { getToneInstructions } from "./brand-profile.js";
import { ensureShopSubscription, syncPlanCredits } from "./billing.server";
import { getPlanById, PLANS } from "./plans.server";

const DEFAULT_PLAN_TOKENS = PLANS.free.tokens;

export class CreditLimitExceededError extends Error {
  constructor(availableCredits, requestedCredits) {
    super(`Not enough credits. ${availableCredits} available, ${requestedCredits} requested.`);
    this.name = "CreditLimitExceededError";
    this.availableCredits = availableCredits;
    this.requestedCredits = requestedCredits;
  }
}

function mapShopCredits(credits, planId = "free") {
  const plan = getPlanById(planId);
  const totalCredits = credits?.totalCredits ?? plan.tokens ?? DEFAULT_PLAN_TOKENS;
  const usedCredits = credits?.usedCredits ?? 0;

  return {
    planId,
    totalCredits,
    usedCredits,
    availableCredits: Math.max(totalCredits - usedCredits, 0),
  };
}

async function getShopPlanTokenLimit(shop) {
  const subscription = await ensureShopSubscription(shop);
  return getPlanById(subscription.planId).tokens;
}

/**
 * Creates the store's credit account on first use and returns the current balance.
 * @param {string} shop
 */
export async function getShopCreditBalance(shop) {
  if (!prisma.shopCredits || !shop) {
    return mapShopCredits(null);
  }

  const subscription = await ensureShopSubscription(shop);
  const planTokens = getPlanById(subscription.planId).tokens;

  const credits = await prisma.shopCredits.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      totalCredits: planTokens,
      usedCredits: 0,
    },
  });

  if (credits.totalCredits !== planTokens) {
    const synced = await syncPlanCredits(shop, subscription.planId);
    return mapShopCredits(synced, subscription.planId);
  }

  return mapShopCredits(credits, subscription.planId);
}

/**
 * Atomically reserves credits before spending AI calls.
 * @param {string} shop
 * @param {{ productId: string, imageId: string, url: string }[]} images
 */
async function reserveGenerationCredits(shop, reservations) {
  if (!prisma.shopCredits || reservations.length === 0) {
    return [];
  }

  const planTokens = await getShopPlanTokenLimit(shop);

  return await prisma.$transaction(async (tx) => {
    const credits = await tx.shopCredits.upsert({
      where: { shop },
      update: {},
      create: {
        shop,
        totalCredits: planTokens,
        usedCredits: 0,
      },
    });

    const availableCredits = credits.totalCredits - credits.usedCredits;
    if (availableCredits < reservations.length) {
      throw new CreditLimitExceededError(availableCredits, reservations.length);
    }

    const updateResult = await tx.shopCredits.updateMany({
      where: {
        shop,
        usedCredits: {
          lte: credits.totalCredits - reservations.length,
        },
      },
      data: {
        usedCredits: {
          increment: reservations.length,
        },
      },
    });

    if (updateResult.count !== 1) {
      const latestCredits = await tx.shopCredits.findUnique({ where: { shop } });
      const subscription = await tx.shopSubscription.findUnique({ where: { shop } });
      const latestBalance = mapShopCredits(latestCredits, subscription?.planId);
      throw new CreditLimitExceededError(latestBalance.availableCredits, reservations.length);
    }

    return await Promise.all(
      reservations.map((reservation) =>
        tx.creditUsage.create({
          data: reservation,
        })
      )
    );
  });
}

/**
 * Atomically reserves tokens before alt text generation.
 * @param {string} shop
 * @param {{ productId: string, imageId: string, url: string }[]} images
 */
export async function reserveAltTextCredits(shop, images) {
  const uniqueImages = Array.from(
    new Map(images.map((image) => [image.imageId, image])).values()
  );

  const reservations = uniqueImages.map((image) => ({
    shop,
    productId: image.productId,
    imageId: image.imageId,
    imageUrl: image.url.startsWith("http") ? image.url : `https:${image.url}`,
    usageType: "IMAGE_ALT_TEXT",
  }));

  return await reserveGenerationCredits(shop, reservations);
}

/**
 * Atomically reserves one token per product before SEO meta generation.
 * @param {string} shop
 * @param {{ productId: string }[]} products
 */
export async function reserveProductSeoCredits(shop, products) {
  const uniqueProducts = Array.from(
    new Map(products.map((product) => [product.productId, product])).values()
  );

  const reservations = uniqueProducts.map((product) => ({
    shop,
    productId: product.productId,
    usageType: "PRODUCT_SEO",
  }));

  return await reserveGenerationCredits(shop, reservations);
}

/**
 * Finalizes a reserved credit after the generated alt text is successfully applied.
 * @param {number} usageId
 * @param {string} altText
 */
export async function markAltTextCreditUsed(usageId, altText) {
  if (!prisma.creditUsage || !usageId) {
    return null;
  }

  return await prisma.creditUsage.update({
    where: { id: usageId },
    data: {
      status: "USED",
      altText,
    },
  });
}

/** @param {number} usageId */
export async function markGenerationCreditUsed(usageId, altText = null) {
  return await markAltTextCreditUsed(usageId, altText);
}

/**
 * Refunds a reserved credit when generation or Shopify update fails.
 * @param {number} usageId
 */
export async function refundAltTextCredit(usageId) {
  if (!prisma.creditUsage || !prisma.shopCredits || !usageId) {
    return null;
  }

  return await prisma.$transaction(async (tx) => {
    const usage = await tx.creditUsage.findUnique({
      where: { id: usageId },
    });

    if (!usage || usage.status !== "RESERVED") {
      return usage;
    }

    const refundResult = await tx.creditUsage.updateMany({
      where: {
        id: usageId,
        status: "RESERVED",
      },
      data: {
        status: "REFUNDED",
      },
    });

    if (refundResult.count !== 1) {
      return await tx.creditUsage.findUnique({ where: { id: usageId } });
    }

    await tx.shopCredits.update({
      where: { shop: usage.shop },
      data: {
        usedCredits: {
          decrement: 1,
        },
      },
    });

    return await tx.creditUsage.findUnique({ where: { id: usageId } });
  });
}

/**
 * Fetches all product images from Shopify using the Media API.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 */
export async function getAllProductImages(admin, maxProducts = 1000) {
  const query = `
    query getProducts($cursor: String) {
      products(first: 20, after: $cursor) {
        edges {
          node {
            id
            title
            description
            seo {
              title
              description
            }
            media(first: 10) {
              edges {
                node {
                  id
                  alt
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  let productImages = [];
  let hasNextPage = true;
  let cursor = null;

  let productsScanned = 0;

  while (hasNextPage && productsScanned < maxProducts) {
    const response = await admin.graphql(query, {
      variables: { cursor },
    });

    const data = await response.json();
    const productEdges = data.data.products.edges;
    productsScanned += productEdges.length;

    for (const edge of productEdges) {
      const product = edge.node;
      for (const mediaEdge of product.media.edges) {
        const media = mediaEdge.node;
        // Only process MediaImage types that have an image property
        if (media.image) {
          productImages.push({
            productId: product.id,
            productTitle: product.title,
            productDescription: product.description,
            productSeo: product.seo,
            imageId: media.id, // This is actually the Media ID
            url: media.image.url,
            altText: media.alt || "", 
          });
        }
      }
    }

    hasNextPage = data.data.products.pageInfo.hasNextPage;
    cursor = productEdges.length > 0 ? productEdges[productEdges.length - 1].cursor : null;
  }

  try {
    if (prisma.imageCache && productImages.length > 0) {
      const urls = productImages.map((image) =>
        image.url.startsWith("http") ? image.url : `https:${image.url}`
      );
      const cachedImages = await prisma.imageCache.findMany({
        where: {
          url: {
            in: urls,
          },
        },
        select: {
          url: true,
          updatedAt: true,
        },
      });
      const generatedAtByUrl = new Map(
        cachedImages.map((image) => [image.url, image.updatedAt.toISOString()])
      );

      productImages = productImages.map((image) => {
        const fullUrl = image.url.startsWith("http") ? image.url : `https:${image.url}`;
        return {
          ...image,
          generatedAt: generatedAtByUrl.get(fullUrl) || null,
        };
      });
    }
  } catch (error) {
    console.error("Image cache timestamp lookup error:", error);
  }

  return productImages;
}

function normalizeImageUrl(imageUrl) {
  return imageUrl?.startsWith("http") ? imageUrl : `https:${imageUrl}`;
}

function mapProductImage(product, media) {
  return {
    productId: product.id,
    productTitle: product.title,
    productDescription: product.description,
    productSeo: product.seo,
    imageId: media.id,
    url: media.image.url,
    altText: media.alt || "",
  };
}

async function enrichImagesWithHistory(shop, productImages) {
  if (!prisma.seoChangeHistory || productImages.length === 0) {
    return productImages;
  }

  const imageIds = productImages.map((image) => image.imageId);
  const productIds = Array.from(new Set(productImages.map((image) => image.productId)));

  const [imageChanges, productChanges] = await Promise.all([
    prisma.seoChangeHistory.findMany({
      where: {
        shop,
        changeType: "IMAGE_ALT_TEXT",
        imageId: { in: imageIds },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.seoChangeHistory.findMany({
      where: {
        shop,
        changeType: "PRODUCT_SEO",
        productId: { in: productIds },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const latestImageChangeById = new Map();
  for (const change of imageChanges) {
    if (!latestImageChangeById.has(change.imageId)) {
      latestImageChangeById.set(change.imageId, change);
    }
  }

  const latestProductChangeById = new Map();
  for (const change of productChanges) {
    if (!latestProductChangeById.has(change.productId)) {
      latestProductChangeById.set(change.productId, change);
    }
  }

  return productImages.map((image) => ({
    ...image,
    latestImageChange: latestImageChangeById.get(image.imageId) || null,
    latestProductSeoChange: latestProductChangeById.get(image.productId) || null,
    generatedAt: latestImageChangeById.get(image.imageId)?.appliedAt?.toISOString()
      || latestImageChangeById.get(image.imageId)?.createdAt?.toISOString()
      || image.generatedAt
      || null,
  }));
}

function matchesAuditFilter(image, filter) {
  const hasAlt = Boolean(image.altText?.trim());
  const hasSeo = Boolean(image.productSeo?.title && image.productSeo?.description);
  const imageStatus = image.latestImageChange?.status;
  const seoStatus = image.latestProductSeoChange?.status;

  if (filter === "missing_alt") return !hasAlt;
  if (filter === "has_alt") return hasAlt;
  if (filter === "ai_generated") return ["SUGGESTED", "APPLIED"].includes(imageStatus);
  if (filter === "needs_seo") return !hasSeo;
  if (filter === "failed") return imageStatus === "FAILED" || seoStatus === "FAILED";
  return true;
}

/**
 * Fetches one cursor-backed page of product images and enriches it with local AI history.
 * Filters are applied to the streamed Shopify pages because Shopify cannot query product
 * media directly by alt-text state.
 */
export async function getProductImageAudit(admin, shop, options = {}) {
  const {
    after = null,
    before = null,
    query: searchQuery = "",
    filter = "all",
    pageSize = 25,
  } = options;
  const isPreviousPage = Boolean(before);
  const productWindowSize = Math.min(Math.max(pageSize, 10), 50);
  const paginationArgs = isPreviousPage
    ? `last: ${productWindowSize}, before: $cursor`
    : `first: ${productWindowSize}, after: $cursor`;

  const query = `
    query getProductImageAudit($cursor: String, $productQuery: String) {
      products(${paginationArgs}, query: $productQuery) {
        edges {
          node {
            id
            title
            description
            seo {
              title
              description
            }
            media(first: 25) {
              edges {
                node {
                  id
                  alt
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  `;

  const productQuery = searchQuery ? `title:*${searchQuery.replace(/"/g, "")}*` : null;
  const response = await admin.graphql(query, {
    variables: {
      cursor: before || after || null,
      productQuery,
    },
  });
  const data = await response.json();
  const products = data.data.products;
  const productImages = [];

  for (const edge of products.edges) {
    for (const mediaEdge of edge.node.media.edges) {
      const media = mediaEdge.node;
      if (media.image) {
        productImages.push(mapProductImage(edge.node, media));
      }
    }
  }

  const enrichedImages = await enrichImagesWithHistory(shop, productImages);
  const filteredImages = enrichedImages.filter((image) => matchesAuditFilter(image, filter));

  return {
    images: filteredImages.slice(0, pageSize),
    pageInfo: products.pageInfo,
  };
}

export async function getImageAuditCounts(admin, shop, maxProducts = 1000) {
  const productImages = await getAllProductImages(admin, maxProducts);
  const enrichedImages = await enrichImagesWithHistory(shop, productImages);
  const productById = new Map(enrichedImages.map((image) => [image.productId, image]));

  return {
    totalImages: enrichedImages.length,
    missingAltText: enrichedImages.filter((image) => !image.altText?.trim()).length,
    optimizedAltText: enrichedImages.filter((image) => image.altText?.trim()).length,
    productsMissingSeo: Array.from(productById.values()).filter((image) => !image.productSeo?.title || !image.productSeo?.description).length,
    aiGenerated: enrichedImages.filter((image) => ["SUGGESTED", "APPLIED"].includes(image.latestImageChange?.status)).length,
  };
}

const GENERIC_ALT_PATTERNS = [
  /^image$/i,
  /^photo$/i,
  /^picture$/i,
  /^img[\d_-]/i,
  /^product$/i,
  /^untitled$/i,
  /^dsc[\d_-]/i,
];

function isQualityAltText(altText) {
  if (!altText?.trim()) return false;
  const trimmed = altText.trim();
  if (trimmed.length < 20 || trimmed.length > 125) return false;
  if (GENERIC_ALT_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  return true;
}

/**
 * Computes a 0–100 SEO health score with breakdown and prioritized actions.
 * @param {{ counts: object, shopSettings: object|null, productImages: object[] }} params
 */
export function computeSeoHealthScore({ counts, shopSettings, productImages }) {
  const total = counts.totalImages || 0;
  const missingAlt = counts.missingAltText || 0;
  const optimizedAlt = counts.optimizedAltText || 0;
  const productsMissingSeo = counts.productsMissingSeo || 0;

  const altCoverageScore = total > 0 ? Math.round((optimizedAlt / total) * 50) : 50;

  const imagesWithAlt = productImages.filter((image) => image.altText?.trim());
  const qualityCount = imagesWithAlt.filter((image) => isQualityAltText(image.altText)).length;
  const altQualityScore =
    imagesWithAlt.length > 0
      ? Math.round((qualityCount / imagesWithAlt.length) * 20)
      : total === 0
        ? 20
        : 0;

  const uniqueProducts = new Set(productImages.map((image) => image.productId)).size;
  const productSeoScore =
    uniqueProducts > 0
      ? Math.round(((uniqueProducts - productsMissingSeo) / uniqueProducts) * 20)
      : 20;

  const profileFields = ["brandName", "industry", "tone"];
  const filledFields = profileFields.filter((field) => shopSettings?.[field]).length;
  const profileScore = Math.round((filledFields / profileFields.length) * 10);

  const score = altCoverageScore + altQualityScore + productSeoScore + profileScore;

  const actions = [];

  if (!shopSettings?.onboardingCompleted) {
    actions.push({
      id: "onboarding",
      priority: "high",
      title: "Complete your brand profile",
      description: "Set your brand, industry, and tone so AI writes alt text that matches your store.",
      href: "/app/onboarding",
      count: null,
    });
  }

  if (missingAlt > 0) {
    actions.push({
      id: "missing_alt",
      priority: "high",
      title: `Generate alt text for ${missingAlt} image${missingAlt === 1 ? "" : "s"}`,
      description: "Missing alt text hurts Google Image search rankings and accessibility scores.",
      href: "/app/image-alt-text?filter=missing_alt",
      count: missingAlt,
    });
  }

  const weakAltCount = imagesWithAlt.filter((image) => !isQualityAltText(image.altText)).length;
  if (weakAltCount > 0) {
    actions.push({
      id: "weak_alt",
      priority: "medium",
      title: `Improve ${weakAltCount} weak alt text${weakAltCount === 1 ? "" : "s"}`,
      description: "Descriptions that are too short, too long, or generic carry less SEO weight.",
      href: "/app/image-alt-text?filter=has_alt",
      count: weakAltCount,
    });
  }

  if (productsMissingSeo > 0) {
    actions.push({
      id: "missing_seo",
      priority: "medium",
      title: `Complete SEO for ${productsMissingSeo} product listing${productsMissingSeo === 1 ? "" : "s"}`,
      description: "Products without a meta title or description rank lower in organic search.",
      href: "/app/image-alt-text?filter=needs_seo",
      count: productsMissingSeo,
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };

  return {
    score,
    grade: score >= 80 ? "good" : score >= 60 ? "fair" : "poor",
    breakdown: {
      altCoverage: { score: altCoverageScore, max: 50, label: "Alt text coverage" },
      altQuality: { score: altQualityScore, max: 20, label: "Alt text quality" },
      productSeo: { score: productSeoScore, max: 20, label: "Product SEO listings" },
      brandProfile: { score: profileScore, max: 10, label: "Brand profile" },
    },
    actions: actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]),
  };
}

/**
 * Updates the alt text for an image in Shopify using the productUpdate mutation.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 * @param {string} productId
 * @param {string} mediaId
 * @param {string} altText
 */
export async function updateImageAltText(admin, productId, mediaId, altText) {
  console.log(`Updating Media ${mediaId} on product ${productId} with alt text: "${altText}"`);
  
  // Using the specific productUpdateMedia mutation for modern Shopify versions
  const mutation = `
    mutation productUpdateMedia($media: [UpdateMediaInput!]!, $productId: ID!) {
      productUpdateMedia(media: $media, productId: $productId) {
        media {
          id
          alt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      productId,
      media: [
        {
          id: mediaId,
          alt: altText,
        }
      ]
    },
  });

  const result = await response.json();
  console.log("Mutation Result JSON:", JSON.stringify(result, null, 2));
  return result;
}

/**
 * Saves the latest known alt text for an image in the local cache.
 * @param {string} imageUrl
 * @param {string} altText
 */
export async function saveImageAltTextCache(imageUrl, altText) {
  if (!prisma.imageCache) {
    return null;
  }

  const fullUrl = imageUrl.startsWith("http") ? imageUrl : `https:${imageUrl}`;

  return await prisma.imageCache.upsert({
    where: { url: fullUrl },
    update: { altText },
    create: { url: fullUrl, altText },
  });
}

/**
 * Generates SEO-optimized alt text for an image using OpenAI GPT-4o-mini.
 * @param {string} imageUrl
 * @param {string} [keywords]
 * @param {object} [shopSettings]
 * @returns {Promise<string>}
 */
export async function generateAltText(imageUrl, keywords = "", shopSettings = null) {
  // Ensure URL has protocol
  const fullUrl = imageUrl.startsWith("http") ? imageUrl : `https:${imageUrl}`;

  const rawKey = process.env.OPENAI_API_KEY;
  if (!rawKey) {
    console.warn("OPENAI_API_KEY is missing. Using fallback text.");
    return "Optimized product image description";
  }

  // Clean the API key
  const apiKey = rawKey.replace(/['"]+/g, '').trim();
  const openai = new OpenAI({ apiKey });

  let contextPrompt = "Generate a clean, SEO-optimized alt text for this product image. Keep it under 125 characters and focus on descriptive keywords.";

  if (shopSettings?.tone) {
    contextPrompt += `\n\nTone of voice: ${getToneInstructions(shopSettings.tone)}`;
  }

  if (shopSettings) {
    const { industry, otherIndustry, brandName, brandTagline, brandValueProp, productCategories, searchTerms } = shopSettings;
    contextPrompt += "\n\nUse the following business context to improve the results:";
    if (brandName) contextPrompt += `\n- Brand Name: ${brandName} (naturally weave the brand name in when it fits — do not force it)`;
    if (industry) {
      const industryText = industry === "other" ? otherIndustry : industry;
      if (industryText) contextPrompt += `\n- Industry: ${industryText} (use industry-appropriate terminology)`;
    }
    if (brandTagline) contextPrompt += `\n- Brand Tagline: ${brandTagline}`;
    if (brandValueProp) contextPrompt += `\n- Brand Value Propositions: ${brandValueProp}`;
    if (productCategories) contextPrompt += `\n- Store Categories: ${productCategories}`;
    if (searchTerms) contextPrompt += `\n- Customer Search Terms: ${searchTerms}`;
  }

  contextPrompt += `\n\nReturn only the alt text string.${keywords ? ` Try to naturally include these target keywords for this specific product: ${keywords}` : ""}`;

  console.log(`Generating Alt Text with OpenAI for: ${fullUrl}`);

  try {
    const userContent = [
      { type: "text", text: contextPrompt },
      {
        type: "image_url",
        image_url: {
          "url": fullUrl,
        },
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      max_tokens: 50,
    });

    const text = response.choices[0]?.message?.content?.trim();
    // Remove wrapping quotes if they exist
    const cleanedText = text.replace(/^["']|["']$/g, '');
    console.log(`OpenAI Response: "${text}" | Cleaned: "${cleanedText}"`);

    if (!cleanedText || cleanedText.length < 2) {
      console.warn("OpenAI returned an empty or too short response. Using fallback.");
      return "Product image";
    }

    // Save to cache
    try {
      if (prisma.imageCache) {
        await prisma.imageCache.upsert({
          where: { url: fullUrl },
          update: { altText: cleanedText },
          create: { url: fullUrl, altText: cleanedText }
        });
      }
    } catch (error) {
      console.error("Cache save error:", error);
    }

    return cleanedText;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    throw new Error(`OpenAI failed: ${error.message}`);
  }
}

/**
 * Generates SEO-optimized Meta Title and Description for a product.
 * @param {string} productTitle
 * @param {string} productDescription
 * @param {object} [shopSettings]
 * @returns {Promise<{title: string, description: string}>}
 */
export async function generateProductSEO(productTitle, productDescription, shopSettings = null) {
  const rawKey = process.env.OPENAI_API_KEY;
  if (!rawKey) {
    return {
      title: `${productTitle} | Optimized Title`,
      description: `Shop ${productTitle}. High quality and best price.`,
    };
  }

  const apiKey = rawKey.replace(/['"]+/g, '').trim();
  const openai = new OpenAI({ apiKey });

  let contextPrompt = `Generate an SEO-optimized Meta Title (max 60 chars) and Meta Description (max 160 chars) for this product:
          
          Title: ${productTitle}
          Description: ${productDescription}`;

  if (shopSettings) {
    const { industry, otherIndustry, brandName, brandTagline, brandValueProp, productCategories, searchTerms, tone } = shopSettings;
    if (tone) contextPrompt += `\n\nTone of voice: ${getToneInstructions(tone)}`;
    contextPrompt += "\n\nUse the following business context to improve the results:";
    if (brandName) contextPrompt += `\n- Brand Name: ${brandName}`;
    if (industry) {
      const industryText = industry === "other" ? otherIndustry : industry;
      if (industryText) contextPrompt += `\n- Industry: ${industryText}`;
    }
    if (brandTagline) contextPrompt += `\n- Brand Tagline: ${brandTagline}`;
    if (brandValueProp) contextPrompt += `\n- Brand Value Propositions: ${brandValueProp}`;
    if (productCategories) contextPrompt += `\n- Relevant Categories: ${productCategories}`;
    if (searchTerms) contextPrompt += `\n- Target Keywords: ${searchTerms}`;
  }

  contextPrompt += "\n\nReturn only a JSON object with \"title\" and \"description\" keys.";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: contextPrompt
        },
      ],
      response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0]?.message?.content);
  } catch (error) {
    console.error("SEO Generation Error:", error);
    return {
      title: productTitle,
      description: productDescription?.substring(0, 157) + "...",
    };
  }
}

/**
 * Updates product meta fields in Shopify.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 * @param {string} productId
 * @param {string} title
 * @param {string} description
 */
export async function updateProductSEO(admin, productId, title, description) {
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          seo {
            title
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      input: {
        id: productId,
        seo: {
          title,
          description,
        },
      },
    },
  });

  return await response.json();
}

/**
 * Saves or updates product keywords in the local database.
 * @param {string} productId
 * @param {string} keywords
 */
export async function saveProductKeywords(productId, keywords) {
  if (!prisma.productKeywords) {
    console.error("Prisma Client missing 'productKeywords' model.");
    return null;
  }
  return await prisma.productKeywords.upsert({
    where: { productId },
    update: { keywords },
    create: { productId, keywords }
  });
}

/**
 * Fetches all product keywords from the local database.
 */
export async function getAllProductKeywords() {
  if (!prisma.productKeywords) {
    console.warn("Prisma Client missing 'productKeywords' model. Returning empty array.");
    return [];
  }
  return await prisma.productKeywords.findMany();
}

/**
 * Fetches the count of cached images (AI-generated).
 */
export async function getCachedImagesCount() {
  if (!prisma.imageCache) {
    return 0;
  }
  return await prisma.imageCache.count();
}

/**
 * Fetches the number of successful AI alt text generations for one shop.
 * @param {string} shop
 */
export async function getShopAltTextUsageCount(shop) {
  if (!prisma.creditUsage || !shop) {
    return 0;
  }

  return await prisma.creditUsage.count({
    where: {
      shop,
      status: "USED",
    },
  });
}

/**
 * Fetches product images with empty alt text from Shopify.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 */
export async function getImagesWithoutAltText(admin) {
  const query = `
    query getFiles($cursor: String) {
      files(first: 50, after: $cursor, query: "media_type:IMAGE") {
        edges {
          node {
            id
            ... on MediaImage {
              image {
                url
                altText
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  let images = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage && images.length < 100) {
    const response = await admin.graphql(query, {
      variables: { cursor },
    });

    const data = await response.json();
    const edges = data.data.files.edges;

    for (const edge of edges) {
      const node = edge.node;
      if (node.image && (!node.image.altText || node.image.altText.trim() === "")) {
        images.push({
          id: node.id,
          url: node.image.url,
        });
      }
    }

    hasNextPage = data.data.files.pageInfo.hasNextPage;
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
  }

  return images;
}

/**
 * Fetches shop settings from the local database.
 * @param {string} shop
 */
export async function getShopSettings(shop) {
  if (!prisma.shopSettings) {
    return null;
  }
  try {
    return await prisma.shopSettings.findUnique({
      where: { shop },
    });
  } catch (error) {
    console.error("getShopSettings error:", error);
    return null;
  }
}

/**
 * Saves or updates shop settings in the local database.
 * @param {string} shop
 * @param {object} settings
 */
export async function saveShopSettings(shop, settings) {
  if (!prisma.shopSettings) {
    return null;
  }
  return await prisma.shopSettings.upsert({
    where: { shop },
    update: { ...settings },
    create: { shop, ...settings }
  });
}

export async function createImageAltTextSuggestion(shop, image, suggestedAltText) {
  if (!prisma.seoChangeHistory) {
    return null;
  }

  return await prisma.seoChangeHistory.create({
    data: {
      shop,
      productId: image.productId,
      imageId: image.imageId,
      imageUrl: normalizeImageUrl(image.url),
      changeType: "IMAGE_ALT_TEXT",
      previousAltText: image.altText || "",
      suggestedAltText,
      status: "SUGGESTED",
    },
  });
}

export async function createProductSeoSuggestion(shop, product, seo) {
  if (!prisma.seoChangeHistory) {
    return null;
  }

  return await prisma.seoChangeHistory.create({
    data: {
      shop,
      productId: product.productId,
      changeType: "PRODUCT_SEO",
      previousSeoTitle: product.productSeo?.title || "",
      previousSeoDescription: product.productSeo?.description || "",
      suggestedSeoTitle: seo.title || "",
      suggestedSeoDescription: seo.description || "",
      status: "SUGGESTED",
    },
  });
}

export async function updateSuggestion(shop, id, data) {
  if (!prisma.seoChangeHistory) {
    return null;
  }

  const change = await prisma.seoChangeHistory.findFirst({
    where: {
      id: Number(id),
      shop,
    },
    select: { id: true },
  });

  if (!change) {
    throw new Error("Suggestion was not found for this shop.");
  }

  return await prisma.seoChangeHistory.update({
    where: { id: change.id },
    data,
  });
}

export async function rejectSuggestion(shop, id) {
  return await updateSuggestion(shop, id, {
    status: "REJECTED",
  });
}

export async function applyImageAltTextSuggestion(admin, shop, id) {
  const change = await prisma.seoChangeHistory.findFirst({
    where: {
      id: Number(id),
      shop,
      changeType: "IMAGE_ALT_TEXT",
      status: "SUGGESTED",
    },
  });

  if (!change) {
    throw new Error("Suggestion was not found or is no longer pending.");
  }

  const altText = change.suggestedAltText || "";
  const response = await updateImageAltText(admin, change.productId, change.imageId, altText);
  const userError = response.data?.productUpdateMedia?.userErrors?.[0];

  if (userError) {
    await updateSuggestion(shop, change.id, {
      status: "FAILED",
      errorMessage: userError.message,
    });
    throw new Error(userError.message);
  }

  await saveImageAltTextCache(change.imageUrl, altText);

  return await updateSuggestion(shop, change.id, {
    status: "APPLIED",
    appliedAltText: altText,
    appliedAt: new Date(),
    errorMessage: null,
  });
}

export async function applyProductSeoSuggestion(admin, shop, id) {
  const change = await prisma.seoChangeHistory.findFirst({
    where: {
      id: Number(id),
      shop,
      changeType: "PRODUCT_SEO",
      status: "SUGGESTED",
    },
  });

  if (!change) {
    throw new Error("Suggestion was not found or is no longer pending.");
  }

  const title = change.suggestedSeoTitle || "";
  const description = change.suggestedSeoDescription || "";
  const response = await updateProductSEO(admin, change.productId, title, description);
  const userError = response.data?.productUpdate?.userErrors?.[0];

  if (userError) {
    await updateSuggestion(shop, change.id, {
      status: "FAILED",
      errorMessage: userError.message,
    });
    throw new Error(userError.message);
  }

  return await updateSuggestion(shop, change.id, {
    status: "APPLIED",
    appliedSeoTitle: title,
    appliedSeoDescription: description,
    appliedAt: new Date(),
    errorMessage: null,
  });
}

export async function getSeoChangeHistory(shop, limit = 50) {
  if (!prisma.seoChangeHistory) {
    return [];
  }

  return await prisma.seoChangeHistory.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getLatestSuggestionsForShop(shop, limit = 200) {
  if (!prisma.seoChangeHistory) {
    return [];
  }

  return await prisma.seoChangeHistory.findMany({
    where: {
      shop,
      status: "SUGGESTED",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function rollbackSeoChange(admin, shop, id) {
  const change = await prisma.seoChangeHistory.findFirst({
    where: {
      id: Number(id),
      shop,
      status: "APPLIED",
    },
  });

  if (!change) {
    throw new Error("Only applied changes can be rolled back.");
  }

  try {
    if (change.changeType === "IMAGE_ALT_TEXT") {
      const response = await updateImageAltText(admin, change.productId, change.imageId, change.previousAltText || "");
      const userError = response.data?.productUpdateMedia?.userErrors?.[0];

      if (userError) {
        throw new Error(userError.message);
      }

      await saveImageAltTextCache(change.imageUrl, change.previousAltText || "");
    } else {
      const response = await updateProductSEO(
        admin,
        change.productId,
        change.previousSeoTitle || "",
        change.previousSeoDescription || ""
      );
      const userError = response.data?.productUpdate?.userErrors?.[0];

      if (userError) {
        throw new Error(userError.message);
      }
    }

    return await updateSuggestion(shop, change.id, {
      status: "ROLLED_BACK",
      rolledBackAt: new Date(),
      errorMessage: null,
    });
  } catch (error) {
    await updateSuggestion(shop, change.id, {
      status: "FAILED",
      errorMessage: error.message,
    });
    throw error;
  }
}
