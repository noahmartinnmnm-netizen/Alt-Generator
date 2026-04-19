import OpenAI from "openai";
import prisma from "../db.server";

/**
 * Fetches all product images from Shopify using the Media API.
 * @param {import("@shopify/shopify-app-react-router/server").AdminApiContext} admin
 */
export async function getAllProductImages(admin) {
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

  while (hasNextPage && productImages.length < 50) {
    const response = await admin.graphql(query, {
      variables: { cursor },
    });

    const data = await response.json();
    const productEdges = data.data.products.edges;

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

  return productImages;
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
 * Generates SEO-optimized alt text for an image using OpenAI GPT-4o-mini.
 * @param {string} imageUrl
 * @param {string} [keywords]
 * @param {object} [shopSettings]
 * @returns {Promise<string>}
 */
export async function generateAltText(imageUrl, keywords = "", shopSettings = null) {
  // Ensure URL has protocol
  const fullUrl = imageUrl.startsWith("http") ? imageUrl : `https:${imageUrl}`;

  // Check cache first
  try {
    if (prisma.imageCache) {
      const cached = await prisma.imageCache.findUnique({
        where: { url: fullUrl }
      });
      // If keywords or shop settings are provided, we might want to regenerate even if cached
      if (cached && !keywords && !shopSettings) {
        console.log(`Using cached alt text for: ${fullUrl}`);
        return cached.altText;
      }
    }
  } catch (error) {
    console.error("Cache lookup error:", error);
  }

  const rawKey = process.env.OPENAI_API_KEY;
  if (!rawKey) {
    console.warn("OPENAI_API_KEY is missing. Using fallback text.");
    return "Optimized product image description";
  }

  // Clean the API key
  const apiKey = rawKey.replace(/['"]+/g, '').trim();
  const openai = new OpenAI({ apiKey });

  let contextPrompt = "Generate a clean, SEO-optimized alt text for this product image. Keep it under 125 characters and focus on descriptive keywords.";
  
  if (shopSettings) {
    const { industry, otherIndustry, brandName, brandTagline, brandValueProp, productCategories, searchTerms } = shopSettings;
    contextPrompt += "\n\nUse the following business context to improve the results:";
    if (brandName) contextPrompt += `\n- Brand Name: ${brandName}`;
    if (industry) {
      const industryText = industry === "other" ? otherIndustry : industry;
      if (industryText) contextPrompt += `\n- Industry: ${industryText}`;
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
    const { industry, otherIndustry, brandName, brandTagline, brandValueProp, productCategories, searchTerms } = shopSettings;
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
  return await prisma.shopSettings.findUnique({
    where: { shop }
  });
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
