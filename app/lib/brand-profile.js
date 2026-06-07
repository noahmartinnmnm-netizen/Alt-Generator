export const INDUSTRY_OPTIONS = [
  { label: "Select your industry", value: "" },
  { label: "Fashion & Apparel", value: "fashion" },
  { label: "Home & Garden", value: "home_garden" },
  { label: "Electronics & Tech", value: "electronics" },
  { label: "Health & Beauty", value: "beauty" },
  { label: "Food & Beverage", value: "food_beverage" },
  { label: "Sports & Fitness", value: "sports" },
  { label: "Jewelry & Accessories", value: "jewelry" },
  { label: "Other", value: "other" },
];

export const TONE_OPTIONS = [
  {
    value: "professional",
    label: "Professional",
    description: "Clear, trustworthy, and authoritative — ideal for B2B or premium brands.",
    example: "Premium organic cotton crew neck t-shirt in navy blue",
  },
  {
    value: "friendly",
    label: "Friendly & Approachable",
    description: "Warm and conversational — great for lifestyle and DTC brands.",
    example: "Soft navy tee you'll want to wear every day",
  },
  {
    value: "luxury",
    label: "Luxury & Refined",
    description: "Elegant, understated vocabulary — perfect for high-end products.",
    example: "Artisan-crafted navy cotton tee with a refined silhouette",
  },
  {
    value: "playful",
    label: "Playful & Energetic",
    description: "Fun and creative — suits youth brands and novelty products.",
    example: "Your new favorite navy tee — comfy, cool, and ready for anything",
  },
  {
    value: "technical",
    label: "Technical & Detailed",
    description: "Spec-focused and precise — best for electronics and gear.",
    example: "100% organic cotton crew neck, navy, medium weight 180gsm fabric",
  },
];

export const INDUSTRY_LABELS = Object.fromEntries(
  INDUSTRY_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]),
);

export function getIndustryLabel(industry, otherIndustry) {
  if (!industry) return null;
  if (industry === "other") return otherIndustry || "Other";
  return INDUSTRY_LABELS[industry] || industry;
}

export function getToneLabel(tone) {
  return TONE_OPTIONS.find((option) => option.value === tone)?.label || null;
}

export function getToneInstructions(tone) {
  const instructions = {
    professional:
      "Write in a professional, clear tone. Use precise product descriptors. Avoid slang and hype.",
    friendly:
      "Write in a warm, approachable tone. Sound like a helpful shop assistant. Keep it natural and inviting.",
    luxury:
      "Write in an elevated, refined tone. Use premium vocabulary sparingly. Emphasize craftsmanship and quality.",
    playful:
      "Write in a fun, energetic tone. Be creative but still descriptive. Light personality is welcome.",
    technical:
      "Write in a technical, detail-oriented tone. Include relevant specs, materials, and functional details.",
  };
  return instructions[tone] || instructions.professional;
}
