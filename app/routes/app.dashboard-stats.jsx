import { authenticateAppRequest } from "../lib/app-auth.server.js";

export const loader = async ({ request }) => {
  const { getDashboardStats } = await import("../lib/seo.server");
  const { session, admin, shopSettings } = await authenticateAppRequest(request);
  return getDashboardStats(admin, session.shop, shopSettings);
};
