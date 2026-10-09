import "server-only";
// The public origin for robots.txt and sitemap.xml. NEXT_PUBLIC_BASE_URL in production; the domain otherwise.
export const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://proofmarket.fun").replace(/\/$/, "");
