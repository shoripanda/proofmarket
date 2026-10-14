// GET /v1/public/assets — 16 §3.2 (P1). No auth. The tokens this server accepts as a reward, registry order.
import { appContext } from "@/lib/context";
import { route } from "@/lib/http";
import { publicAssets } from "@/lib/services/public-service";

export const dynamic = "force-dynamic";

export const GET = route(async () =>
  Response.json(publicAssets(appContext()), {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  }),
);
