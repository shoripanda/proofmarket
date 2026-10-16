import "server-only";
// General tasks (docs/architecture 13 §7.1): requester and worker endpoints. Thin wrappers over
// market-task-service so tests can call them with a test AppContext. All answer 404 TASKS_NOT_ENABLED until the
// operator turns on the tasks_enabled flag.

import { ApiError } from "@proofmarket/core";
import {
  ApplyTaskRequestSchema,
  CreateTaskRequestSchema,
  DecisionReasonSchema,
  DeliverSeatRequestSchema,
  ReleaseSeatRequestSchema,
} from "@proofmarket/core/schemas/api";
import type { z } from "zod";
import { authenticateRequester } from "../auth/requester";
import { requireWorker } from "../auth/worker";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { withIdempotency } from "../services/idempotency";
import {
  applyToTask,
  cancelTask,
  createTask,
  decideApplication,
  decideSeat,
  deliverSeat,
  getTask,
  getTaskForWorker,
  listApplications,
  listMySeats,
  listOpenTasksForWorker,
  listTasks,
  requireTasksEnabled,
} from "../services/market-task-service";
import { consumeRateLimit, rateLimitHeaders } from "../services/rate-limit";

function parse<T extends z.ZodType>(s: T, raw: unknown): z.infer<T> {
  const r = s.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}

// ---------- requester ----------

/** POST /v1/tasks. `dry_run: true` returns the cost and needs no Idempotency-Key. */
export async function handleCreateTask(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  await requireTasksEnabled(app.db);
  const rl = await consumeRateLimit(app, `cred:${auth.credentialId}`, auth.limits.rateLimitPerMin);
  const raw = await readJson(req);
  const body = parse(CreateTaskRequestSchema, raw);
  if (body.dry_run) {
    const out = await app.db.transaction((tx) => createTask(app, tx, auth, body, "dry-run"));
    return Response.json(out.body, { status: out.status, headers: rateLimitHeaders(rl) });
  }
  const key = req.headers.get("idempotency-key");
  if (!key) throw new ApiError("VALIDATION_FAILED", { header: "Idempotency-Key is required" });
  const out = await withIdempotency<unknown>(app, auth.credentialId, "POST /v1/tasks", key, raw, (tx) =>
    createTask(app, tx, auth, body, key),
  );
  return Response.json(out.body, {
    status: out.status,
    headers: { ...rateLimitHeaders(rl), ...(out.replayed ? { "Idempotent-Replayed": "true" } : {}) },
  });
}

export async function handleListTasksOwn(app: AppContext, req: Request): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await listTasks(app, auth));
}

export async function handleGetTask(app: AppContext, req: Request, id: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await getTask(app, auth, id));
}

export async function handleCancelTask(app: AppContext, req: Request, id: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await cancelTask(app, auth, id));
}

export async function handleListApplications(app: AppContext, req: Request, id: string): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  return Response.json(await listApplications(app, auth, id));
}

/** POST /v1/tasks/{id}/applications/{app_id}/{accept|reject} */
export async function handleDecideApplication(
  app: AppContext,
  req: Request,
  id: string,
  appId: string,
  action: string,
): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  if (action !== "accept" && action !== "reject") throw new ApiError("VALIDATION_FAILED", { action });
  const raw = await readJson(req).catch(() => ({}));
  const reason =
    action === "reject" && raw && typeof raw === "object" && "reason" in raw ? String(raw.reason) : null;
  return Response.json(await decideApplication(app, auth, id, appId, action, reason?.slice(0, 1000) ?? null));
}

/** POST /v1/tasks/{id}/seats/{seat_id}/{release|request-changes|reject} */
export async function handleDecideSeat(
  app: AppContext,
  req: Request,
  id: string,
  seatId: string,
  action: string,
): Promise<Response> {
  const auth = await authenticateRequester(app, req);
  const raw = await readJson(req).catch(() => ({}));
  if (action === "release") {
    // Releasing is final: the agent must say it means it (13 §7.2, like RentAHuman's acknowledgeRelease).
    parse(ReleaseSeatRequestSchema, raw);
    return Response.json(await decideSeat(app, auth, id, seatId, "release", null));
  }
  if (action === "request-changes" || action === "reject") {
    const { reason } = parse(DecisionReasonSchema, raw);
    return Response.json(
      await decideSeat(app, auth, id, seatId, action === "reject" ? "reject" : "request_changes", reason),
    );
  }
  throw new ApiError("VALIDATION_FAILED", { action });
}

// ---------- worker ----------

export async function handleWorkerListMarketTasks(app: AppContext, req: Request): Promise<Response> {
  const w = await requireWorker(app, req);
  return Response.json(await listOpenTasksForWorker(app, w.workerId));
}

export async function handleWorkerGetMarketTask(
  app: AppContext,
  req: Request,
  id: string,
): Promise<Response> {
  const w = await requireWorker(app, req);
  return Response.json(await getTaskForWorker(app, w.workerId, id));
}

export async function handleWorkerApply(app: AppContext, req: Request, id: string): Promise<Response> {
  const w = await requireWorker(app, req);
  const body = parse(ApplyTaskRequestSchema, await readJson(req).catch(() => ({})));
  return Response.json(await applyToTask(app, w.workerId, id, body));
}

export async function handleWorkerListSeats(app: AppContext, req: Request): Promise<Response> {
  const w = await requireWorker(app, req);
  return Response.json(await listMySeats(app, w.workerId));
}

export async function handleWorkerDeliver(app: AppContext, req: Request, seatId: string): Promise<Response> {
  const w = await requireWorker(app, req);
  const body = parse(DeliverSeatRequestSchema, await readJson(req));
  return Response.json(await deliverSeat(app, w.workerId, seatId, body));
}
