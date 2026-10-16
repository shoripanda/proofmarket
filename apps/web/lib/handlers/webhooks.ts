import "server-only";
// Self-service webhook endpoints for an API key (docs/architecture 12 §5.1, 13 §7.3): register, list, delete,
// send a signed test, and read the delivery log. Before this, endpoints were registered by the operator only.

import { ApiError } from "@proofmarket/core";
import { CreateWebhookRequestSchema, WebhookDeliveriesQuerySchema } from "@proofmarket/core/schemas/api";
import { authenticateRequester } from "../auth/requester";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { consumeRateLimit } from "../services/rate-limit";
import {
  createOwnWebhook,
  type DeliverDeps,
  disableOwnWebhook,
  listOwnDeliveries,
  listOwnWebhooks,
  testOwnWebhook,
} from "../services/webhook-service";

const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) =>
  e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

export async function handleCreateWebhook(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const r = CreateWebhookRequestSchema.safeParse(await readJson(req));
  if (!r.success) throw new ApiError("VALIDATION_FAILED", { issues: issues(r.error) });
  return Response.json(await createOwnWebhook(app, auth, r.data), { status: 201 });
}

export async function handleListWebhooks(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await listOwnWebhooks(app, auth.credentialId));
}

export async function handleDeleteWebhook(app: AppContext, req: Request, id: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await disableOwnWebhook(app, auth.credentialId, id));
}

/** Two tests a minute per key: enough to debug a receiver, too few to aim the server at someone. */
export async function handleTestWebhook(
  app: AppContext,
  req: Request,
  id: string,
  deps: DeliverDeps = {},
): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  await consumeRateLimit(app, `webhook-test:${auth.credentialId}`, 2);
  return Response.json(await testOwnWebhook(app, auth.credentialId, id, deps));
}

export async function handleListDeliveries(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const q = WebhookDeliveriesQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) throw new ApiError("VALIDATION_FAILED", { issues: issues(q.error) });
  return Response.json(await listOwnDeliveries(app, auth.credentialId, q.data));
}
