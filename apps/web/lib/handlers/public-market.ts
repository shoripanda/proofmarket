import "server-only";
// The public task list (docs/architecture 14 §6). No auth; 404 TASKS_NOT_ENABLED until tasks open.

import { ApiError } from "@proofmarket/core";
import { PublicMarketTasksQuerySchema } from "@proofmarket/core/schemas/api";
import type { AppContext } from "../context";
import { getPublicMarketTask, listPublicMarketTasks } from "../services/market-task-service";
import { clientIp } from "../services/oauth-service";
import { consumeRateLimit } from "../services/rate-limit";

const PER_MIN = 60;
const CACHE = { "Cache-Control": "public, max-age=30, s-maxage=30" };

/** GET /v1/public/market-tasks?cursor= */
export async function handlePublicMarketTasks(app: AppContext, req: Request): Promise<Response> {
  await consumeRateLimit(app, `pub-market:${clientIp(req)}`, PER_MIN);
  const r = PublicMarketTasksQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!r.success) throw new ApiError("VALIDATION_FAILED", { field: "cursor" });
  return Response.json(await listPublicMarketTasks(app, r.data), { headers: CACHE });
}

/** GET /v1/public/market-tasks/{id} */
export async function handlePublicMarketTask(app: AppContext, req: Request, id: string): Promise<Response> {
  await consumeRateLimit(app, `pub-market:${clientIp(req)}`, PER_MIN);
  return Response.json(await getPublicMarketTask(app, id), { headers: CACHE });
}
