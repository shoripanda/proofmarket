import "server-only";
// Public worker profiles (docs/architecture 14 §3): the worker edits their own; anyone reads the public ones.
// Every route answers 404 TASKS_NOT_ENABLED until the operator turns on tasks_enabled.

import { ApiError } from "@proofmarket/core";
import { PublicWorkersQuerySchema, WorkerProfileUpdateSchema } from "@proofmarket/core/schemas/api";
import { requireWorker } from "../auth/worker";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { clientIp } from "../services/oauth-service";
import {
  getMyProfile,
  getPublicProfile,
  listPublicProfiles,
  updateMyProfile,
} from "../services/profile-service";
import { consumeRateLimit } from "../services/rate-limit";

const PUBLIC_PER_MIN = 60;
const CACHE = { "Cache-Control": "public, max-age=30, s-maxage=30" };

function invalid(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new ApiError("VALIDATION_FAILED", {
    issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

/** GET / PUT /v1/worker/profile. A worker session only: requester keys and OAuth tokens cannot edit it. */
export async function handleWorkerProfile(app: AppContext, req: Request): Promise<Response> {
  const w = await requireWorker(app, req);
  if (req.method === "GET") return Response.json(await getMyProfile(app, w.workerId));
  await consumeRateLimit(app, `worker-profile:${w.workerId}`, 10);
  const r = WorkerProfileUpdateSchema.safeParse(await readJson(req));
  if (!r.success) invalid(r.error.issues);
  return Response.json(await updateMyProfile(app, w.workerId, r.data));
}

/** GET /v1/public/workers?skill=&city=&lang=&cursor= */
export async function handlePublicWorkers(app: AppContext, req: Request): Promise<Response> {
  await consumeRateLimit(app, `pub-workers:${clientIp(req)}`, PUBLIC_PER_MIN);
  const r = PublicWorkersQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!r.success) invalid(r.error.issues);
  return Response.json(await listPublicProfiles(app, r.data), { headers: CACHE });
}

/** GET /v1/public/workers/{public_id} */
export async function handlePublicWorker(app: AppContext, req: Request, publicId: string): Promise<Response> {
  await consumeRateLimit(app, `pub-workers:${clientIp(req)}`, PUBLIC_PER_MIN);
  return Response.json(await getPublicProfile(app, publicId), { headers: CACHE });
}
