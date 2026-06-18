import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptySearchResult,
  IndexTable,
  InlineStack,
  Layout,
  Modal,
  Page,
  Text,
} from "@shopify/polaris";
import { UndoIcon } from "@shopify/polaris-icons";
import { authenticateAppRequest } from "../lib/app-auth.server.js";
import { getSeoChangeHistory, rollbackSeoChange } from "../lib/seo.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticateAppRequest(request);
  const history = await getSeoChangeHistory(session.shop, 100);

  return { history };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") === "rollback") {
    try {
      await rollbackSeoChange(admin, session.shop, formData.get("changeId"));
      return { status: "success", message: "Change rolled back in Shopify" };
    } catch (error) {
      return { status: "error", message: error.message };
    }
  }

  return { status: "error", message: "Unsupported action" };
};

function statusBadge(status) {
  if (status === "APPLIED") return <Badge tone="success">Applied</Badge>;
  if (status === "SUGGESTED") return <Badge tone="info">Suggested</Badge>;
  if (status === "FAILED") return <Badge tone="critical">Failed</Badge>;
  if (status === "ROLLED_BACK") return <Badge tone="attention">Rolled back</Badge>;
  return <Badge tone="subdued">Rejected</Badge>;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderTableText(children, { maxWidth = "360px", minWidth = "240px", tone } = {}) {
  return (
    <div
      style={{
        maxWidth,
        minWidth,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        lineHeight: "1.35",
      }}
    >
      <Text as="p" variant="bodySm" tone={tone}>
        {children}
      </Text>
    </div>
  );
}

export default function HistoryPage() {
  const { history } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [rollbackRecord, setRollbackRecord] = useState(null);
  const handledResponse = useRef(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handledResponse.current === fetcher.data) {
      return;
    }

    handledResponse.current = fetcher.data;
    shopify.toast.show(fetcher.data.message || "History updated", {
      isError: fetcher.data.status === "error",
    });
    if (fetcher.data.status === "success") {
      setRollbackRecord(null);
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const rows = useMemo(() => history.map((record, index) => {
    const isImage = record.changeType === "IMAGE_ALT_TEXT";
    const previousValue = isImage
      ? record.previousAltText || "Empty alt text"
      : `${record.previousSeoTitle || "No title"}\n${record.previousSeoDescription || "No description"}`;
    const suggestedValue = isImage
      ? record.suggestedAltText || record.appliedAltText || "No suggestion"
      : `${record.suggestedSeoTitle || record.appliedSeoTitle || "No title"}\n${record.suggestedSeoDescription || record.appliedSeoDescription || "No description"}`;

    return (
      <IndexTable.Row id={String(record.id)} key={record.id} position={index}>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="bold">
              {isImage ? "Image alt text" : "Product SEO"}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {record.productId}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{statusBadge(record.status)}</IndexTable.Cell>
        <IndexTable.Cell>
          {renderTableText(previousValue)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {renderTableText(suggestedValue)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minWidth="180px">
            <BlockStack gap="100">
              <Text as="span" variant="bodySm">{formatDate(record.createdAt)}</Text>
              {record.appliedAt ? <Text as="span" variant="bodySm" tone="subdued">Applied {formatDate(record.appliedAt)}</Text> : null}
              {record.rolledBackAt ? <Text as="span" variant="bodySm" tone="subdued">Rolled back {formatDate(record.rolledBackAt)}</Text> : null}
              {record.errorMessage ? renderTableText(record.errorMessage, { maxWidth: "220px", minWidth: "160px", tone: "critical" }) : null}
            </BlockStack>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack align="end" wrap={false}>
            <Button
              icon={UndoIcon}
              onClick={() => setRollbackRecord(record)}
              disabled={record.status !== "APPLIED"}
            >
              Rollback
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  }), [history]);

  return (
    <Page
      fullWidth
      title="Generation History"
      subtitle="Review AI suggestions, applied changes, failures, and rollback status for this shop."
      backAction={{ content: "Image audit", url: "/app/image-alt-text" }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "history record", plural: "history records" }}
              itemCount={history.length}
              selectable={false}
              emptyState={<EmptySearchResult title="No history yet" description="Generated and applied changes will appear here." withIllustration />}
              headings={[
                { title: "Change", minWidth: "260px" },
                { title: "Status", minWidth: "100px" },
                { title: "Previous value", minWidth: "280px" },
                { title: "Suggested/applied value", minWidth: "280px" },
                { title: "Timeline", minWidth: "180px" },
                { title: "Actions", alignment: "end" },
              ]}
              lastColumnSticky
            >
              {rows}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={Boolean(rollbackRecord)}
        onClose={() => setRollbackRecord(null)}
        title="Rollback this Shopify change?"
        primaryAction={{
          content: "Rollback",
          destructive: true,
          loading: fetcher.state !== "idle",
          onAction: () => fetcher.submit({
            intent: "rollback",
            changeId: rollbackRecord.id,
          }, { method: "POST" }),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setRollbackRecord(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            This restores the previous value in Shopify and marks the history record as rolled back.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
