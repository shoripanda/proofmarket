import "server-only";
// Requester endpoint handlers (05 §2). Routes are thin wrappers so tests can call these with a test AppContext.

import { ApiError, parseId } from "@proofmarket/core";
import { authenticateRequester } from "../auth/requester";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { challengeVerification } from "../services/challenge-service";
import { withIdempotency } from "../services/idempotency";
import { evidenceUrls, publicOnchain, publicResult } from "../services/public-service";
import { consumeRateLimit, rateLimitHeaders } from "../services/rate-limit";
import {
  cancelVerification,
  createVerification,
  createVerificationBatch,
  disputeVerification,
  getVerification,
  parseBatchBody,
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

/** POST /v1/verifications/batch (01 §4.25). One Idempotency-Key for the whole batch. */
export async function handleCreateBatch(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const key = req.headers.get("idempotency-key");
  if (!key) throw new ApiError("VALIDATION_FAILED", { header: "Idempotency-Key is required" });
  const raw = await readJson(req);
  const bodies = parseBatchBody(raw);
  const out = await withIdempotency(app, auth.credentialId, "POST /v1/verifications/batch", key, raw, (tx) =>
    createVerificationBatch(app, tx, auth, bodies, key),
  );
  return Response.json(out.body, {
    status: out.status,
    headers: { ...rateLimitHeaders(rl), ...(out.replayed ? { "Idempotent-Replayed": "true" } : {}) },
  });
}

/** Below the route's maxDuration (60 s) with room for the reads themselves. */
export const MAX_WAIT_S = 45;

/** GET /v1/verifications/{id}?wait=<0-45>: with wait, long-polls until the state changes (01 §4.27). */
export async function handleGet(app: AppContext, req: Request, rawId: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const id = verificationId(rawId);
  const waitS = Math.min(
    MAX_WAIT_S,
    Math.max(0, Number(new URL(req.url).searchParams.get("wait") ?? 0) || 0),
  );
  let view = await getVerification(app, auth, id);
  const start = view.updated_at;
  const until = Date.now() + waitS * 1000;
  // One DB read every 2 s; counts once against the rate limit, however long it waits.
  while (Date.now() < until && view.updated_at === start && view.result === null) {
    await new Promise((r) => setTimeout(r, Math.min(2000, until - Date.now())));
    view = await getVerification(app, auth, id);
  }
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

/** 13 §2: the Task account and how a program reads it. No auth. */
export async function handlePublicOnchain(app: AppContext, _req: Request, rawId: string): Promise<Response> {
  return Response.json(await publicOnchain(app, rawId), {
    headers: { "Cache-Control": "public, max-age=60" },
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

/** 13 §3: challenge an optimistic answer within its window. Any API key; the bond comes from its balance. */
export async function handleChallenge(app: AppContext, req: Request, rawId: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const key = req.headers.get("idempotency-key");
  if (!key) throw new ApiError("VALIDATION_FAILED", { header: "Idempotency-Key is required" });
  const id = verificationId(rawId);
  const raw = await readJson(req).catch(() => ({}));
  const out = await withIdempotency(
    app,
    auth.credentialId,
    `POST /v1/verifications/${id}/challenge`,
    key,
    raw,
    (tx) => challengeVerification(app, tx, auth, id, raw),
  );
  return Response.json(out.body, {
    status: out.status,
    headers: { ...rateLimitHeaders(rl), ...(out.replayed ? { "Idempotent-Replayed": "true" } : {}) },
  });
}
