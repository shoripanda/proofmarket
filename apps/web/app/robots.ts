// /robots.txt — public pages are open to crawlers; the API, the worker app and the console are not pages to index.
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

const PRIVATE = ["/console", "/tasks", "/claims", "/payouts", "/onboarding", "/login"];

// Agents look for these first (docs/architecture 12 §3.3, §5.1): /llms.txt, /llms-full.txt, /agents.json,
// /openapi.json. Fetchers that act on a person's request (Claude-User, ChatGPT-User, Perplexity-User) may read
// the public API too; calling it is what the service is for.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["Claude-User", "ChatGPT-User", "Perplexity-User"],
        allow: ["/", "/v1/public/", "/v1/health"],
        disallow: ["/v1/admin/", "/v1/worker/", "/api/", ...PRIVATE],
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/v1/", "/api/", "/mcp", "/oauth/", ...PRIVATE],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
