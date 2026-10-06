// GET /v1/public/dataset.jsonl — the same rows, one JSON object per line (01 §4.24).
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { cachedPublicDataset } from "@/lib/services/map-service";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const d = await cachedPublicDataset(appContext());
  const body = `${d.rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'inline; filename="proofmarket-dataset.jsonl"',
      "X-License": "CC-BY-4.0",
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
});
