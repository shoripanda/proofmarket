import "server-only";
// A requester's preferred and blocked workers (docs/architecture 14 §4). 404 TASKS_NOT_ENABLED until tasks open.

import { ApiError } from "@proofmarket/core";
import { SetWorkerPreferenceRequestSchema } from "@proofmarket/core/schemas/api";
import { authenticateRequester } from "../auth/requester";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { listWorkerPreferences, setWorkerPreference } from "../services/prefs-service";
import { consumeRateLimit } from "../services/rate-limit";

/** GET / POST /v1/worker-preferences */
export async function handleWorkerPreferences(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  if (req.method === "GET") return Response.json(await listWorkerPreferences(app, auth));
  await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const r = SetWorkerPreferenceRequestSchema.safeParse(await readJson(req));
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return Response.json(await setWorkerPreference(app, auth, r.data));
}
