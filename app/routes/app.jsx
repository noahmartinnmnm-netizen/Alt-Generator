import { Link, Outlet, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export const loader = async () => {
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
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

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255, 255, 255, 0.72)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "min(320px, 90vw)",
          padding: "20px 24px",
          borderRadius: "12px",
          background: "var(--p-color-bg-surface, #fff)",
          boxShadow: "var(--p-shadow-400, 0 4px 16px rgba(0,0,0,0.12))",
          textAlign: "center",
          font: "500 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          color: "var(--p-color-text, #303030)",
        }}
      >
        Loading page…
      </div>
    </div>
  );
}

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <NavigationLoadingBar />
        <ui-nav-menu>
          <Link to="/app" rel="home">
            Home
          </Link>
          <Link to="/app/image-alt-text">Image Alt text</Link>
          <Link to="/app/billing">Plans</Link>
          <Link to="/app/history">History</Link>
          <Link to="/app/settings">Brand profile</Link>
          <Link to="/app/faq">Help & FAQ</Link>
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
