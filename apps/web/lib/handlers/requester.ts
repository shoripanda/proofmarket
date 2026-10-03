import "server-only";
// Requester endpoint handlers (05 §2). Routes are thin wrappers so tests can call these with a test AppContext.

import { ApiError, parseId } from "@proofmarket/core";
import { authenticateRequester } from "../auth/requester";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { withIdempotency } from "../services/idempotency";
import { evidenceUrls, publicResult } from "../services/public-service";
import { consumeRateLimit, rateLimitHeaders } from "../services/rate-limit";
import {
  cancelVerification,
  createVerification,
  disputeVerification,
  getVerification,
  parseCreateBody,
} from "../services/requester-service";
import { createSchedule, listSchedules, stopSchedule } from "../services/schedule-service";

function verificationId(raw: string): string {
  const id = parseId("verification", raw);
  if (!id) throw new ApiError("VERIFICATION_NOT_FOUND");
  return id;
}

export async function handleCreate(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const key = req.headers.get("idempotency-key");
  if (!key) throw new ApiError("VALIDATION_FAILED", { header: "Idempotency-Key is required" });
  const raw = await readJson(req);
  const body = parseCreateBody(raw);
  const out = await withIdempotency(app, auth.credentialId, "POST /v1/verifications", key, raw, (tx) =>
    createVerification(app, tx, auth, body, key),
  );
  return Response.json(out.body, {
    status: out.status,
    headers: { ...rateLimitHeaders(rl), ...(out.replayed ? { "Idempotent-Replayed": "true" } : {}) },
  });
}

export async function handleGet(app: AppContext, req: Request, rawId: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const view = await getVerification(app, auth, verificationId(rawId));
  return Response.json(view, { headers: rateLimitHeaders(rl) });
}

export async function handleCancel(app: AppContext, req: Request, rawId: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const view = await cancelVerification(app, auth, verificationId(rawId));
  return Response.json(view, { headers: rateLimitHeaders(rl) });
}

export async function handleEvidenceUrls(app: AppContext, req: Request, rawId: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await evidenceUrls(app, auth, rawId));
}

export async function handlePublicResult(app: AppContext, _req: Request, rawId: string): Promise<Response> {
  return Response.json(await publicResult(app, rawId), {
    headers: { "Cache-Control": "public, max-age=10" },
  });
}

export async function handleCreateSchedule(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  return Response.json(await createSchedule(app, auth, await readJson(req)), {
    status: 201,
    headers: rateLimitHeaders(rl),
  });
}

export async function handleListSchedules(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await listSchedules(app, auth));
}

export async function handleStopSchedule(app: AppContext, req: Request, rawId: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await stopSchedule(app, auth, rawId));
}

export async function handleDispute(app: AppContext, req: Request, rawId: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const out = await disputeVerification(
    app,
    auth,
    verificationId(rawId),
    await readJson(req).catch(() => ({})),
  );
  return Response.json(out, { status: 201, headers: rateLimitHeaders(rl) });
}
