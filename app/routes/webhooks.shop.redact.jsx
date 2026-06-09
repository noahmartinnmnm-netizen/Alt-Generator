import { authenticate } from "../shopify.server";
import { deleteShopData } from "../lib/shop-data-cleanup.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await deleteShopData(shop);

  return new Response();
};
