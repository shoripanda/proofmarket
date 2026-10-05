// GET /v1/public/map — 01 §4.22 (P2). No auth. Results their requesters published; cached about a minute.
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { cachedPublicMap } from "@/lib/services/map-service";

export const dynamic = "force-dynamic";

export const GET = route(async () =>
  Response.json(await cachedPublicMap(appContext()), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  }),
);
