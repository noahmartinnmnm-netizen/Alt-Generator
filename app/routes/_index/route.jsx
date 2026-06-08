import { redirect, Form, useLoaderData, Link } from "react-router";
import { login } from "../../shopify.server";
import { APP_NAME } from "../../lib/legal-content";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{APP_NAME}</h1>
        <p className={styles.text}>
          AI-powered alt text and SEO for your Shopify product images.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>AI alt text generation</strong>. Generate descriptive, SEO-friendly alt text for every product image using GPT-4o-mini vision.
          </li>
          <li>
            <strong>Brand-aware content</strong>. Tailor AI output to your industry, tone of voice, and SEO keywords.
          </li>
          <li>
            <strong>Review & rollback</strong>. Approve changes before they go live and roll back anytime from History.
          </li>
        </ul>
        <nav className={styles.footer}>
          <Link to="/privacy">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms">Terms of Service</Link>
          <span>·</span>
          <Link to="/faq">FAQ</Link>
        </nav>
      </div>
    </div>
  );
}
