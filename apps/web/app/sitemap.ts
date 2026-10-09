// /sitemap.xml — the public pages in both languages (English lives at /en/<path>).
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

const PAGES = [
  "",
  "/how-it-works",
  "/developers",
  "/pricing",
  "/workers",
  "/join",
  "/try",
  "/demo",
  "/map",
  "/stats",
  "/data",
  "/faq",
  "/rules",
  "/legal",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((p) => [
    { url: `${SITE_URL}${p || "/"}`, alternates: { languages: { en: `${SITE_URL}/en${p}` } } },
    { url: `${SITE_URL}/en${p}`, alternates: { languages: { ja: `${SITE_URL}${p || "/"}` } } },
  ]);
}
