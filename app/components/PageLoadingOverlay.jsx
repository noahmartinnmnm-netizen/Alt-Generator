import { Spinner } from "@shopify/polaris";

export function PageLoadingOverlay() {
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
        background: "rgba(255, 255, 255, 0.55)",
        backdropFilter: "blur(2px)",
        pointerEvents: "none",
      }}
    >
      <Spinner accessibilityLabel="Loading page" size="large" />
    </div>
  );
}
