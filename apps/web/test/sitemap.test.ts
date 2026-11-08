// /sitemap.xml lists only pages that exist: each fixed path must have a page.tsx under app/(site), either directly
// or through a dynamic segment whose generateStaticParams covers it (here: /legal/[doc]).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCS } from "@/lib/legal";
import { SITEMAP_PAGES } from "@/lib/sitemap-pages";

const SITE = join(__dirname, "..", "app", "(site)");

function hasPage(path: string): boolean {
  if (existsSync(join(SITE, path, "page.tsx"))) return true;
  const doc = /^\/legal\/([^/]+)$/.exec(path)?.[1];
  return doc !== undefined && doc in LEGAL_DOCS && existsSync(join(SITE, "legal", "[doc]", "page.tsx"));
}

describe("sitemap pages", () => {
  it("every listed path has a page (no 404 in the sitemap)", () => {
    const missing = SITEMAP_PAGES.filter((p) => !hasPage(p));
    expect(missing).toEqual([]);
  });

  it("lists each legal document, not the /legal index that does not exist", () => {
    expect(SITEMAP_PAGES).not.toContain("/legal");
    expect(SITEMAP_PAGES).toContain("/legal/operator");
    for (const doc of Object.keys(LEGAL_DOCS)) expect(SITEMAP_PAGES).toContain(`/legal/${doc}`);
  });

  it("has no duplicates", () => {
    expect(new Set(SITEMAP_PAGES).size).toBe(SITEMAP_PAGES.length);
  });
});
