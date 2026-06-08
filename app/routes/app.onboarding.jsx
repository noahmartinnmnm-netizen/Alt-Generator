import { useCallback, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Select,
  Button,
  InlineStack,
  Box,
  Banner,
  Divider,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShopSettings, saveShopSettings } from "../lib/seo.server";
import {
  INDUSTRY_OPTIONS,
  TONE_OPTIONS,
  getIndustryLabel,
  getToneLabel,
  getToneInstructions,
} from "../lib/brand-profile.js";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "brand", title: "Brand" },
  { id: "industry", title: "Industry" },
  { id: "tone", title: "Tone" },
  { id: "details", title: "Details" },
  { id: "preview", title: "Preview" },
];

export const loader = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const settings = (await getShopSettings(session.shop)) || {};

  if (settings.onboardingCompleted) {
    throw redirect("/app/settings");
  }

  return {
    settings,
    completed: false,
  };
};

export const action = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();

  const settings = {
    brandName: formData.get("brandName") || "",
    industry: formData.get("industry") || "",
    otherIndustry: formData.get("otherIndustry") || "",
    brandTagline: formData.get("brandTagline") || "",
    brandValueProp: formData.get("brandValueProp") || "",
    productCategories: formData.get("productCategories") || "",
    searchTerms: formData.get("searchTerms") || "",
    tone: formData.get("tone") || "professional",
    onboardingCompleted: true,
  };

  await saveShopSettings(session.shop, settings);

  const { initializeShopBilling } = await import("../lib/billing.server");
  await initializeShopBilling(session.shop);

  throw redirect("/app/billing");
};

function StepIndicator({ currentStep }) {
  return (
    <InlineStack gap="200" align="center" blockAlign="center">
      {STEPS.map((step, index) => {
        const isActive = index === currentStep;
        const isDone = index < currentStep;
        return (
          <InlineStack key={step.id} gap="200" blockAlign="center">
            <Box
              padding="150"
              borderRadius="full"
              background={isActive ? "bg-fill-brand" : isDone ? "bg-fill-success" : "bg-surface-secondary"}
              minWidth="28px"
              minHeight="28px"
            >
              <Text
                as="span"
                variant="bodySm"
                fontWeight="semibold"
                alignment="center"
                tone={isActive || isDone ? "text-inverse" : "subdued"}
              >
                {index + 1}
              </Text>
            </Box>
            {index < STEPS.length - 1 && (
              <Box minWidth="24px" borderBlockEndWidth="025" borderColor="border" />
            )}
          </InlineStack>
        );
      })}
    </InlineStack>
  );
}

export default function OnboardingPage() {
  const { settings, completed } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    brandName: settings.brandName || "",
    industry: settings.industry || "",
    otherIndustry: settings.otherIndustry || "",
    tone: settings.tone || "",
    brandTagline: settings.brandTagline || "",
    brandValueProp: settings.brandValueProp || "",
    productCategories: settings.productCategories || "",
    searchTerms: settings.searchTerms || "",
  });

  const isSubmitting = fetcher.state !== "idle";

  const updateField = useCallback(
    (field) => (value) => setForm((prev) => ({ ...prev, [field]: value })),
    [],
  );

  const canContinue = () => {
    if (step === 1) return form.brandName.trim().length >= 2;
    if (step === 2) return form.industry && (form.industry !== "other" || form.otherIndustry.trim().length >= 3);
    if (step === 3) return Boolean(form.tone);
    return true;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((prev) => prev - 1);
  };

  const handleFinish = () => {
    fetcher.submit(form, { method: "POST" });
  };

  const selectedTone = TONE_OPTIONS.find((option) => option.value === form.tone);
  const industryLabel = getIndustryLabel(form.industry, form.otherIndustry);

  return (
    <Page
      title={completed ? "Brand profile" : "Set up your store"}
      subtitle={
        completed
          ? "Update how AI writes alt text for your products."
          : "Tell us about your brand before your first AI generation."
      }
      backAction={completed ? { content: "Dashboard", url: "/app" } : undefined}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {!completed && (
              <Card>
                <BlockStack gap="300" inlineAlign="center">
                  <StepIndicator currentStep={step} />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Step {step + 1} of {STEPS.length} — {STEPS[step].title}
                  </Text>
                </BlockStack>
              </Card>
            )}

            {step === 0 && !completed && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">
                    Welcome to SEO Hero AI
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    In about 2 minutes, we&apos;ll learn your brand voice so every alt text we generate sounds like
                    you — not a generic robot. This directly improves your Google Image SEO and accessibility.
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">What we&apos;ll ask:</Text>
                    <InlineStack gap="200">
                      <Badge tone="info">Brand name</Badge>
                      <Badge tone="info">Industry</Badge>
                      <Badge tone="info">Tone of voice</Badge>
                      <Badge tone="info">Optional keywords</Badge>
                    </InlineStack>
                  </BlockStack>
                  <InlineStack align="end">
                    <Button variant="primary" onClick={handleNext}>
                      Get started
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {step === 1 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    What&apos;s your brand name?
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    We&apos;ll weave your brand into alt text when it fits naturally — boosting brand recognition in image search.
                  </Text>
                  <TextField
                    label="Brand name"
                    value={form.brandName}
                    onChange={updateField("brandName")}
                    placeholder="e.g. EcoStyle, Peak Gear Co."
                    autoComplete="organization"
                    helpText="Required — at least 2 characters"
                  />
                  <StepNav
                    onBack={completed ? () => navigate("/app") : handleBack}
                    onNext={handleNext}
                    canContinue={canContinue()}
                    showBack={step > 0 || completed}
                  />
                </BlockStack>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    What industry are you in?
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Industry context helps AI use the right terminology — &quot;supima cotton tee&quot; for fashion vs. &quot;180gsm fabric&quot; for technical gear.
                  </Text>
                  <Select
                    label="Industry"
                    options={INDUSTRY_OPTIONS}
                    value={form.industry}
                    onChange={updateField("industry")}
                  />
                  {form.industry === "other" && (
                    <TextField
                      label="Describe your business"
                      value={form.otherIndustry}
                      onChange={updateField("otherIndustry")}
                      placeholder="e.g. Handmade wooden toys, sustainable packaging..."
                      multiline={2}
                      autoComplete="off"
                    />
                  )}
                  <StepNav onBack={handleBack} onNext={handleNext} canContinue={canContinue()} showBack />
                </BlockStack>
              </Card>
            )}

            {step === 3 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    How should your alt text sound?
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    This is the biggest lever for on-brand results. Pick the voice that matches your storefront copy.
                  </Text>
                  <BlockStack gap="300">
                    {TONE_OPTIONS.map((option) => (
                      <Box
                        key={option.value}
                        padding="400"
                        borderWidth="025"
                        borderRadius="200"
                        borderColor={form.tone === option.value ? "border-brand" : "border"}
                        background={form.tone === option.value ? "bg-surface-selected" : "bg-surface"}
                      >
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingSm">
                              {option.label}
                            </Text>
                            <Button
                              size="slim"
                              variant={form.tone === option.value ? "primary" : "secondary"}
                              onClick={() => updateField("tone")(option.value)}
                            >
                              {form.tone === option.value ? "Selected" : "Select"}
                            </Button>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {option.description}
                          </Text>
                          <Text as="p" variant="bodySm">
                            <Text as="span" fontWeight="semibold">Example: </Text>
                            &quot;{option.example}&quot;
                          </Text>
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                  <StepNav onBack={handleBack} onNext={handleNext} canContinue={canContinue()} showBack />
                </BlockStack>
              </Card>
            )}

            {step === 4 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Optional: sharpen your SEO targeting
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    These help AI include high-intent keywords customers actually search for. Skip if unsure — you can add these later in Settings.
                  </Text>
                  <TextField
                    label="Tagline"
                    value={form.brandTagline}
                    onChange={updateField("brandTagline")}
                    placeholder="e.g. Sustainable fashion for everyone"
                    autoComplete="off"
                  />
                  <TextField
                    label="Product categories & features"
                    value={form.productCategories}
                    onChange={updateField("productCategories")}
                    placeholder="e.g. Women's dresses, organic cotton, summer collection"
                    multiline={2}
                    autoComplete="off"
                  />
                  <TextField
                    label="Customer search terms"
                    value={form.searchTerms}
                    onChange={updateField("searchTerms")}
                    placeholder="e.g. eco-friendly dress, sustainable summer outfit"
                    multiline={2}
                    autoComplete="off"
                    helpText="Terms your customers type into Google"
                  />
                  <StepNav onBack={handleBack} onNext={handleNext} canContinue showBack />
                </BlockStack>
              </Card>
            )}

            {step === 5 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Here&apos;s how AI will write for {form.brandName}
                  </Text>
                  <Banner tone="success">
                    <p>Your brand profile is ready. Every alt text generation will use these settings.</p>
                  </Banner>

                  <BlockStack gap="300">
                    <ProfileRow label="Brand" value={form.brandName} />
                    <ProfileRow label="Industry" value={industryLabel} />
                    <ProfileRow label="Tone" value={getToneLabel(form.tone)} />
                    {form.brandTagline && <ProfileRow label="Tagline" value={form.brandTagline} />}
                    {form.productCategories && <ProfileRow label="Categories" value={form.productCategories} />}
                    {form.searchTerms && <ProfileRow label="Search terms" value={form.searchTerms} />}
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Sample alt text preview
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      For a navy blue organic cotton t-shirt:
                    </Text>
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        &quot;{buildPreviewAltText(form, selectedTone)}&quot;
                      </Text>
                    </Box>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Tone instruction sent to AI: {getToneInstructions(form.tone)}
                    </Text>
                  </BlockStack>

                  <InlineStack align="space-between">
                    <Button onClick={handleBack}>Back</Button>
                    <Button variant="primary" onClick={handleFinish} loading={isSubmitting}>
                      {completed ? "Save changes" : "Finish setup & go to dashboard"}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {completed && step === 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="p" variant="bodyMd">
                    Your brand profile is active. Edit any section below or jump straight to generating alt text.
                  </Text>
                  <InlineStack gap="300">
                    <Button onClick={() => setStep(1)}>Edit brand profile</Button>
                    <Button variant="primary" onClick={() => navigate("/app/image-alt-text")}>
                      Generate alt text
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function StepNav({ onBack, onNext, canContinue, showBack }) {
  return (
    <InlineStack align="space-between">
      {showBack ? <Button onClick={onBack}>Back</Button> : <span />}
      <Button variant="primary" onClick={onNext} disabled={!canContinue}>
        Continue
      </Button>
    </InlineStack>
  );
}

function ProfileRow({ label, value }) {
  if (!value) return null;
  return (
    <InlineStack gap="200">
      <Text as="span" variant="bodySm" fontWeight="semibold">
        {label}:
      </Text>
      <Text as="span" variant="bodySm">
        {value}
      </Text>
    </InlineStack>
  );
}

function buildPreviewAltText(form, toneOption) {
  const brand = form.brandName.trim();
  const industry = getIndustryLabel(form.industry, form.otherIndustry);

  if (toneOption?.example) {
    if (brand && form.tone === "professional") {
      return `${brand} ${toneOption.example.charAt(0).toLowerCase()}${toneOption.example.slice(1)}`;
    }
    return toneOption.example;
  }

  return industry
    ? `Product image showcasing ${industry.toLowerCase()} item`
    : "Descriptive product image alt text";
}
