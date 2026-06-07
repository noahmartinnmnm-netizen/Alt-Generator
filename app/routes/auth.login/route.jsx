import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  try {
    const errors = loginErrorMessage(await login(request));
    return { errors };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("Auth login loader error:", error);
    return { errors: { shop: "Could not start login. Restart the dev server and try again." } };
  }
};

export const action = async ({ request }) => {
  try {
    const errors = loginErrorMessage(await login(request));
    return { errors };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("Auth login action error:", error);
    return { errors: { shop: "Could not start login. Restart the dev server and try again." } };
  }
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Install Ai-alt-Text">
          <s-paragraph>
            For local development, open the app from your terminal: run shopify app dev, press P,
            then click Install in your dev store. Or open Shopify Admin → Apps → Ai-alt-Text.
          </s-paragraph>
        </s-section>
        <Form method="post">
          <s-section heading="Manual login (fallback)">
            <s-text-field
              name="shop"
              label="Shop domain"
              details="Use your .myshopify.com address, e.g. noah-testing-01.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">Continue to Shopify install</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
