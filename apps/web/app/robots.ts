// /robots.txt — public pages are open to crawlers; the API, the worker app and the console are not pages to index.
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/v1/",
        "/api/",
        "/mcp",
        "/oauth/",
        "/console",
        "/tasks",
        "/claims",
        "/payouts",
        "/onboarding",
        "/login",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
