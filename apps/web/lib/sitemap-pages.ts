// The fixed public pages listed in /sitemap.xml (Japanese path; English is the same path under /en).
// test/sitemap.test.ts checks that each one has a page, so a link that 404s cannot be listed.
import { LEGAL_DOCS } from "./legal";

export const SITEMAP_PAGES = [
  "",
  "/how-it-works",
  "/connect",
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
  // There is no /legal index page: list each document instead.
  "/legal/operator",
  ...Object.keys(LEGAL_DOCS).map((doc) => `/legal/${doc}`),
];
