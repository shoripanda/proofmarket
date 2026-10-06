// GET /v1/public/dataset — 01 §4.24. No auth. Published, verified observations with their Solana record. CC BY 4.0.
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { cachedPublicDataset } from "@/lib/services/map-service";

export const dynamic = "force-dynamic";

export const GET = route(async () =>
  Response.json(await cachedPublicDataset(appContext()), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  }),
);
