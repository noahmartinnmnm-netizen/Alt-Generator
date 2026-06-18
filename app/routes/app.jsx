import { Link, Outlet, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { PageLoadingOverlay } from "../components/PageLoadingOverlay";

export const loader = async () => {
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export const shouldRevalidate = ({ currentUrl, nextUrl, formAction }) => {
  if (formAction) {
    return true;
  }
  return currentUrl.pathname !== nextUrl.pathname;
};

function NavigationLoadingBar() {
  const navigation = useNavigation();
  const isNavigating =
    navigation.state === "loading" &&
    navigation.location &&
    !navigation.formAction;

  if (!isNavigating) {
    return null;
  }

  return <PageLoadingOverlay />;
}

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <NavigationLoadingBar />
        <ui-nav-menu>
          <Link to="/app" prefetch="intent" rel="home">
            Home
          </Link>
          <Link to="/app/image-alt-text" prefetch="intent">
            Image Alt text
          </Link>
          <Link to="/app/billing" prefetch="intent">
            Plans
          </Link>
          <Link to="/app/history" prefetch="intent">
            History
          </Link>
          <Link to="/app/settings" prefetch="intent">
            Brand profile
          </Link>
          <Link to="/app/faq" prefetch="intent">
            Help & FAQ
          </Link>
        </ui-nav-menu>
        <Outlet />
      </PolarisProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
