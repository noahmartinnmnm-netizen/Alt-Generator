import { APP_NAME, SUPPORT_EMAIL } from "./legal-content";

export const FAQ_ITEMS = [
  {
    question: `What does ${APP_NAME} do?`,
    answer:
      `${APP_NAME} helps Shopify merchants improve product image SEO by generating descriptive, search-friendly alt text using AI. It also generates product meta titles and descriptions, tracks your SEO health, and lets you review, apply, or roll back changes from a history log.`,
  },
  {
    question: "How do generation credits work?",
    answer:
      "Each store receives 30 free generation credits when the app is installed. One credit is used per product image when you generate alt text. You can see your remaining credits on the Dashboard and Image Alt Text pages. If you run out of credits, you can still edit and roll back previously applied changes from History.",
  },
  {
    question: "What is the Brand Profile and why does it matter?",
    answer:
      "Your Brand Profile (industry, brand name, tone of voice, tagline, value propositions, and SEO keywords) tells the AI how to write alt text that matches your brand. The more complete your profile, the more accurate and on-brand your generated alt text will be. You can update it anytime from Brand profile in the app navigation.",
  },
  {
    question: "Can I review AI suggestions before they go live?",
    answer:
      "Yes. Generated alt text and SEO suggestions appear for your review before being applied to Shopify. You can accept, edit, or reject each suggestion. Applied changes are recorded in History, where you can roll them back if needed.",
  },
  {
    question: "What data is sent to OpenAI?",
    answer:
      "When you generate alt text, the app sends your product image URL and relevant brand profile settings (industry, tone, keywords, etc.) to OpenAI's GPT-4o-mini model for processing. We do not send customer personal data. Generated alt text is stored in our database to support history and rollback features.",
  },
  {
    question: "What Shopify permissions does the app need?",
    answer: `${APP_NAME} requests read and write access to products and files so it can scan product images, read existing alt text and SEO fields, and apply your approved changes. These permissions are required for the app to function.`,
  },
  {
    question: "How does History and rollback work?",
    answer:
      "Every alt text and SEO change is logged in History with its previous and new values. If you applied a change and want to undo it, you can roll it back from the History page. Rollback restores the previous alt text or SEO fields in your Shopify store.",
  },
  {
    question: "What happens when I uninstall the app?",
    answer: `When you uninstall ${APP_NAME}, your Shopify session and app data are removed from our servers. Alt text and SEO changes you already applied to your products remain in your Shopify store. Cached image data and change history associated with your shop are deleted.`,
  },
  {
    question: "Is my store data secure?",
    answer:
      "Yes. We use encrypted connections (HTTPS) for all data transmission. Shopify access tokens are stored securely and only used to perform actions you request. We do not sell or share your store data with third parties except OpenAI for AI generation, as described in our Privacy Policy.",
  },
  {
    question: "How do I get help or report an issue?",
    answer: `If you have questions or need support, contact us at ${SUPPORT_EMAIL}. We aim to respond within 2 business days.`,
  },
];
