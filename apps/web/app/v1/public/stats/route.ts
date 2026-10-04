// GET /v1/public/stats — 05 §4.1 (P1). No auth. Aggregates only; cached about a minute.
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { cachedPublicStats } from "@/lib/services/stats-service";

export const dynamic = "force-dynamic";

export const GET = route(async () =>
  Response.json(await cachedPublicStats(appContext()), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  }),
);
