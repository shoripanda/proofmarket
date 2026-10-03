import "server-only";
// Worker endpoint handlers (05 §3). Every handler authenticates via Privy (IdentityProvider).

import { ApiError, parseId } from "@proofmarket/core";
import {
  CreateUploadRequestSchema,
  OnboardingRequestSchema,
  SubmitEvidenceRequestSchema,
  WorkerTaskQuerySchema,
} from "@proofmarket/core/schemas/api";
import type { z } from "zod";
import { authenticateWorker, requireWorker } from "../auth/worker";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { submitEvidence } from "../services/evidence-service";
import { withIdempotency } from "../services/idempotency";
import { workerPayouts } from "../services/public-service";
import {
  abandonClaim,
  claimDetail,
  claimTask,
  createUpload,
  issueChallenge,
  listTasks,
  onboard,
  taskDetail,
  workerMe,
} from "../services/worker-service";

function parse<T extends z.ZodType>(s: T, raw: unknown): z.infer<T> {
  const r = s.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}
const verId = (raw: string) =>
  parseId("verification", raw) ??
  (() => {
    throw new ApiError("VERIFICATION_NOT_FOUND");
  })();
const claimId = (raw: string) =>
  parseId("claim", raw) ??
  (() => {
    throw new ApiError("FORBIDDEN");
  })();

export async function handleMe(app: AppContext, req: Request) {
  const a = await authenticateWorker(app, req);
  return Response.json(await workerMe(app, a.privyUserId));
}

export async function handleOnboarding(app: AppContext, req: Request) {
  const a = await authenticateWorker(app, req);
  const body = parse(OnboardingRequestSchema, await readJson(req));
  await onboard(app, a.privyUserId, body);
  return Response.json(await workerMe(app, a.privyUserId));
}

export async function handleListTasks(app: AppContext, req: Request) {
  const w = await requireWorker(app, req);
  const q = parse(WorkerTaskQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  return Response.json(await listTasks(app, w.workerId, q));
}

export async function handleTaskDetail(app: AppContext, req: Request, id: string) {
  await requireWorker(app, req);
  return Response.json(await taskDetail(app, verId(id)));
}

export async function handleClaim(app: AppContext, req: Request, id: string) {
  const w = await requireWorker(app, req);
  return Response.json(await claimTask(app, w.workerId, verId(id)), { status: 201 });
}

export async function handleChallenge(app: AppContext, req: Request, id: string) {
  const w = await requireWorker(app, req);
  return Response.json(await issueChallenge(app, w.workerId, claimId(id)), { status: 201 });
}

export async function handleUpload(app: AppContext, req: Request, id: string) {
  const w = await requireWorker(app, req);
  const raw = (await readJson(req)) as { content_type?: unknown; byte_size?: unknown };
  if (raw.content_type !== undefined && raw.content_type !== "image/jpeg")
    throw new ApiError("MEDIA_TYPE_UNSUPPORTED");
  if (typeof raw.byte_size === "number" && raw.byte_size > 8 * 1024 * 1024)
    throw new ApiError("MEDIA_TOO_LARGE");
  const body = parse(CreateUploadRequestSchema, raw);
  return Response.json(await createUpload(app, w.workerId, claimId(id), body), { status: 201 });
}

export async function handleEvidence(app: AppContext, req: Request, id: string) {
  const w = await requireWorker(app, req);
  const key = req.headers.get("idempotency-key");
  if (!key) throw new ApiError("VALIDATION_FAILED", { header: "Idempotency-Key is required" });
  const raw = await readJson(req);
  const body = parse(SubmitEvidenceRequestSchema, raw);
  const vid = verId(id);
  const out = await withIdempotency(
    app,
    w.workerId,
    `POST /v1/worker/tasks/${vid}/evidence`,
    key,
    raw,
    async (tx) => ({
      status: 200,
      body: await submitEvidence(app, tx, w.workerId, vid, body, key),
    }),
  );
  return Response.json(out.body, {
    status: out.status,
    headers: out.replayed ? { "Idempotent-Replayed": "true" } : {},
  });
}

export async function handleAbandon(app: AppContext, req: Request, id: string) {
  const w = await requireWorker(app, req);
  return Response.json(await abandonClaim(app, w.workerId, claimId(id)));
}

export async function handleClaimDetail(app: AppContext, req: Request, id: string) {
  const w = await requireWorker(app, req);
  return Response.json(await claimDetail(app, w.workerId, claimId(id)));
}

export async function handlePayouts(app: AppContext, req: Request) {
  const w = await requireWorker(app, req);
  return Response.json(await workerPayouts(app, w.workerId));
}
