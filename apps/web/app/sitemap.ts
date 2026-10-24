// /sitemap.xml — the public pages in both languages (English lives at /en/<path>).
import type { MetadataRoute } from "next";
import { appContext } from "@/lib/context";
import { flagEnabled } from "@/lib/services/flags";
import { openPublicTaskIds } from "@/lib/services/market-task-service";
import { indexableProfileIds } from "@/lib/services/profile-service";
import { SITE_URL } from "@/lib/site-url";

const PAGES = [
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
  "/legal",
];

export const dynamic = "force-dynamic";

/**
 * While tasks are open: /people with the profiles whose workers allowed indexing (docs/architecture 14 §3.3), and
 * /market with its open tasks (§6).
 */
async function peoplePages(): Promise<{ path: string; lastModified?: Date }[]> {
  try {
    const db = appContext().db;
    if (!(await flagEnabled(db, "tasks_enabled"))) return [];
    const [ids, tasks] = await Promise.all([
      indexableProfileIds(db),
      openPublicTaskIds(db, appContext().now()),
    ]);
    return [
      { path: "/people" },
      ...ids.map((p) => ({ path: `/people/${p.publicId}`, lastModified: p.updatedAt })),
      { path: "/market" },
      ...tasks.map((t) => ({ path: `/market/${t.id}`, lastModified: t.updatedAt })),
    ];
  } catch (e) {
    console.error("sitemap: people unavailable", e);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [
    ...PAGES.map((path) => ({ path, lastModified: undefined as Date | undefined })),
    ...(await peoplePages()),
  ];
  return pages.flatMap(({ path: p, lastModified }) => [
    { url: `${SITE_URL}${p || "/"}`, lastModified, alternates: { languages: { en: `${SITE_URL}/en${p}` } } },
    { url: `${SITE_URL}/en${p}`, lastModified, alternates: { languages: { ja: `${SITE_URL}${p || "/"}` } } },
  ]);
}
