import "server-only";
// General tasks next to verifications (docs/architecture 13, owner decisions D1-D6 of 2026-10-16).
//
// Money: creating a task reserves (price + fee) × seats from the requester's balance in one RESERVE row. Each seat
// is escrowed on chain only when a worker takes it (FUND_SEAT, one on-chain Task per seat and round, 13 §6.3).
// A released seat is settled to the worker (SETTLE_SEAT) and its fee is kept; a rejected or expired seat's escrow
// goes back to the treasury (REFUND_SEAT) and the seat can be filled again while the task is open. When the task is
// over, every seat number that was never released is handed back to the balance, fee included (one REFUND row each).
//
// Release (D2): manual tasks are paid when the requester releases, or 24 hours after delivery if the requester
// does nothing. Auto tasks are paid on delivery. Nobody at the operator decides (#49).
import { createHash } from "node:crypto";
import {
  ApiError,
  evaluateQuestion,
  fromMicro,
  newId,
  parseId,
  platformFeeMicro,
  type SeatState,
  toBaseUnits,
  toMicro,
  type WebhookEvent,
} from "@proofmarket/core";
import type { CreateTaskRequest, TaskView } from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { sha256, witnessRef } from "./crypto";
import { flagEnabled } from "./flags";
import { balanceMicro, checkBountyAsset, checkSpendPolicy } from "./requester-service";
import { enqueueJob, lockCredential, microToDecimal } from "./task-engine";
import { enqueueTaskWebhook } from "./webhook-service";

/** D2: a delivered seat is paid this long after delivery if the requester decides nothing. */
export const REVIEW_WINDOW_MS = 24 * 3600_000;
/** Requests for changes per seat (13 §2). */
export const MAX_REVISIONS = 3;
/** The latest a task's application deadline may be. */
const MAX_DEADLINE_MS = 30 * 24 * 3600_000;
/** On-chain deadline margin past the seat's last possible review. */
const CHAIN_MARGIN_MS = 7 * 24 * 3600_000;

type TaskRow = typeof schema.marketTasks.$inferSelect;
type SeatRow = typeof schema.taskSeats.$inferSelect;

export async function requireTasksEnabled(db: Db): Promise<void> {
  if (!(await flagEnabled(db, "tasks_enabled"))) throw new ApiError("TASKS_NOT_ENABLED");
}

const LIVE: SeatState[] = ["ASSIGNED", "IN_REVIEW"];

/** SHA-256(task id ‖ seat no ‖ round): the seat's on-chain Task. */
export function seatTaskIdHash(taskId: string, seatNo: number, round: number): Buffer {
  return createHash("sha256").update(`${taskId}:${seatNo}:${round}`).digest();
}

/** The ledger key of a seat number (rounds share it: the money was reserved once per seat number). */
const seatKey = (taskId: string, seatNo: number) => `${taskId}#${seatNo}`;

const expectedNetwork = (app: AppContext) => (app.config.cluster === "devnet" ? "solana-devnet" : "solana");

function costOf(t: Pick<TaskRow, "asset" | "price" | "seats" | "feeRateBps" | "feePerSeat">) {
  const fee = toMicro(t.feePerSeat);
  const total = (toMicro(t.price) + fee) * BigInt(t.seats);
  return {
    asset: t.asset,
    price_per_seat: fromMicro(toMicro(t.price)),
    seats: t.seats,
    platform_fee: {
      rate_bps: t.feeRateBps,
      per_seat: fromMicro(fee),
      amount: fromMicro(fee * BigInt(t.seats)),
    },
    total: fromMicro(total),
  } as TaskView["cost"];
}

// ---------- create ----------

export type CreateTaskResult =
  | { status: 201; body: TaskView }
  | { status: 200; body: { dry_run: true; cost: TaskView["cost"]; balance_after: string } };

export async function createTask(
  app: AppContext,
  tx: Db,
  auth: RequesterAuth,
  body: CreateTaskRequest,
  idempotencyKey: string,
): Promise<CreateTaskResult> {
  await requireTasksEnabled(tx);
  const now = app.now();
  checkBountyAsset(app, { asset: body.price.asset, amount: body.price.amount });
  if (body.price.network !== expectedNetwork(app)) {
    throw new ApiError("VALIDATION_FAILED", { field: "price.network", expected: expectedNetwork(app) });
  }
  const deadline = new Date(body.deadline);
  if (
    deadline.getTime() < now.getTime() + 10 * 60_000 ||
    deadline.getTime() > now.getTime() + MAX_DEADLINE_MS
  ) {
    throw new ApiError("DEADLINE_OUT_OF_RANGE", { min_minutes: 10, max_days: 30 });
  }
  for (const text of [body.title, body.description, body.completion_criteria]) {
    const policy = evaluateQuestion(text);
    if (!policy.ok) throw new ApiError("TASK_POLICY_VIOLATION", { rule_id: policy.ruleId });
  }
  const ids = body.application_questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) {
    throw new ApiError("VALIDATION_FAILED", { field: "application_questions", reason: "duplicate id" });
  }

  const price = toMicro(body.price.amount);
  const feeBps = app.config.platformFeeBps;
  const feePerSeat = platformFeeMicro(price, feeBps);
  const total = (price + feePerSeat) * BigInt(body.seats);
  const row = {
    asset: body.price.asset,
    price: fromMicro(price),
    seats: body.seats,
    feeRateBps: feeBps,
    feePerSeat: fromMicro(feePerSeat),
  };

  await lockCredential(tx, auth.credentialId);
  await checkSpendPolicy(tx, auth, body.price.asset, total, now);
  const balance = await balanceMicro(tx, auth.credentialId, body.price.asset);
  if (body.dry_run) {
    return {
      status: 200,
      body: { dry_run: true, cost: costOf(row), balance_after: fromMicro(balance - total) },
    };
  }
  if (balance < total) throw new ApiError("INSUFFICIENT_BALANCE");

  const idemHash = sha256(idempotencyKey);
  const [existing] = await tx
    .select()
    .from(schema.marketTasks)
    .where(
      and(
        eq(schema.marketTasks.credentialId, auth.credentialId),
        eq(schema.marketTasks.idempotencyKeyHash, idemHash),
      ),
    );
  if (existing) return { status: 201, body: await taskView(tx, app, existing) };

  const id = newId("marketTask");
  const [task] = await tx
    .insert(schema.marketTasks)
    .values({
      id,
      credentialId: auth.credentialId,
      principalId: auth.principalId,
      title: body.title,
      description: body.description,
      completionCriteria: body.completion_criteria,
      evidenceTypes: body.evidence_types,
      applicationQuestions: body.application_questions,
      area: body.area ?? null,
      remoteOk: body.remote_ok,
      network: body.price.network,
      selectionMode: body.selection_mode,
      releaseMode: body.release_mode,
      completionWindowH: body.completion_window_hours,
      deadline,
      status: "OPEN",
      idempotencyKeyHash: idemHash,
      createdAt: now,
      updatedAt: now,
      ...row,
    })
    .returning();
  if (!task) throw new Error("insert returned no row");
  await tx.insert(schema.requesterLedger).values({
    credentialId: auth.credentialId,
    marketTaskId: id,
    seatId: null,
    entryType: "RESERVE",
    amount: microToDecimal(-total),
    asset: body.price.asset,
    createdAt: now,
  });
  await appendAudit(tx, {
    verificationId: null,
    actorType: "requester",
    actorRef: auth.keyPrefix,
    eventType: "request_created",
    beforeState: null,
    afterState: "OPEN",
    correlationId: id,
    metadata: { kind: "task", total: fromMicro(total), seats: body.seats },
  });
  return { status: 201, body: await taskView(tx, app, task) };
}

// ---------- reads ----------

async function loadOwnTask(db: Db, auth: RequesterAuth, rawId: string): Promise<TaskRow> {
  const id = parseId("marketTask", rawId);
  if (!id) throw new ApiError("TASK_NOT_FOUND");
  const [t] = await db
    .select()
    .from(schema.marketTasks)
    .where(and(eq(schema.marketTasks.id, id), eq(schema.marketTasks.credentialId, auth.credentialId)));
  if (!t) throw new ApiError("TASK_NOT_FOUND");
  return t;
}

async function lockTaskRow(tx: Db, id: string): Promise<TaskRow> {
  await tx.execute(sql`select id from market_tasks where id = ${id} for update`);
  const [t] = await tx.select().from(schema.marketTasks).where(eq(schema.marketTasks.id, id));
  if (!t) throw new ApiError("TASK_NOT_FOUND");
  return t;
}

async function seatsOf(db: Db, taskId: string): Promise<SeatRow[]> {
  return db
    .select()
    .from(schema.taskSeats)
    .where(eq(schema.taskSeats.taskId, taskId))
    .orderBy(asc(schema.taskSeats.seatNo), asc(schema.taskSeats.round));
}

async function latestDelivery(db: Db, seatId: string) {
  const [d] = await db
    .select()
    .from(schema.taskSubmissions)
    .where(eq(schema.taskSubmissions.seatId, seatId))
    .orderBy(desc(schema.taskSubmissions.round))
    .limit(1);
  return d ? { round: d.round, body: d.body, links: d.links } : null;
}

async function seatView(db: Db, app: AppContext, s: SeatRow) {
  return {
    seat_id: s.id,
    seat_no: s.seatNo,
    round: s.round,
    state: s.state as SeatState,
    worker_ref: witnessRef(app.config.workerRefSalt, s.workerId, s.taskId),
    funded: s.fundedAt !== null,
    assigned_at: s.assignedAt.toISOString(),
    due_at: s.dueAt.toISOString(),
    submitted_at: s.submittedAt?.toISOString() ?? null,
    review_due_at: s.reviewDueAt?.toISOString() ?? null,
    revisions: s.revisions,
    released_by: (s.releasedBy as "requester" | "timeout" | "auto" | null) ?? null,
    decision_reason: s.decisionReason,
    delivery: await latestDelivery(db, s.id),
  };
}

export async function taskView(db: Db, app: AppContext, t: TaskRow): Promise<TaskView> {
  const seats = await seatsOf(db, t.id);
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.taskApplications)
    .where(and(eq(schema.taskApplications.taskId, t.id), eq(schema.taskApplications.state, "pending")));
  return {
    task_id: t.id,
    kind: "task",
    status: t.status as TaskView["status"],
    title: t.title,
    description: t.description,
    completion_criteria: t.completionCriteria,
    evidence_types: t.evidenceTypes as TaskView["evidence_types"],
    area: t.area,
    remote_ok: t.remoteOk,
    selection_mode: t.selectionMode as TaskView["selection_mode"],
    release_mode: t.releaseMode as TaskView["release_mode"],
    completion_window_hours: t.completionWindowH,
    deadline: t.deadline.toISOString(),
    application_questions: t.applicationQuestions as TaskView["application_questions"],
    cost: costOf(t),
    applications_pending: Number(pending?.n ?? 0),
    seats: await Promise.all(seats.map((s) => seatView(db, app, s))),
    created_at: t.createdAt.toISOString(),
  };
}

export async function getTask(app: AppContext, auth: RequesterAuth, rawId: string): Promise<TaskView> {
  await requireTasksEnabled(app.db);
  return taskView(app.db, app, await loadOwnTask(app.db, auth, rawId));
}

export async function listTasks(app: AppContext, auth: RequesterAuth): Promise<{ tasks: TaskView[] }> {
  await requireTasksEnabled(app.db);
  const rows = await app.db
    .select()
    .from(schema.marketTasks)
    .where(eq(schema.marketTasks.credentialId, auth.credentialId))
    .orderBy(desc(schema.marketTasks.createdAt))
    .limit(100);
  return { tasks: await Promise.all(rows.map((t) => taskView(app.db, app, t))) };
}

async function workerCounts(db: Db, workerId: string) {
  const [tasks] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.taskSeats)
    .where(and(eq(schema.taskSeats.workerId, workerId), eq(schema.taskSeats.state, "RELEASED")));
  const [ver] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.witnessSubmissions)
    .where(
      and(eq(schema.witnessSubmissions.workerId, workerId), eq(schema.witnessSubmissions.state, "VALID")),
    );
  return { completed_tasks: Number(tasks?.n ?? 0), completed_verifications: Number(ver?.n ?? 0) };
}

export async function listApplications(app: AppContext, auth: RequesterAuth, rawId: string) {
  await requireTasksEnabled(app.db);
  const t = await loadOwnTask(app.db, auth, rawId);
  const rows = await app.db
    .select()
    .from(schema.taskApplications)
    .where(eq(schema.taskApplications.taskId, t.id))
    .orderBy(asc(schema.taskApplications.createdAt));
  return {
    applications: await Promise.all(
      rows.map(async (a) => ({
        application_id: a.id,
        worker_ref: witnessRef(app.config.workerRefSalt, a.workerId, t.id),
        state: a.state as "pending" | "accepted" | "rejected" | "withdrawn",
        answers: a.answers as Record<string, string>,
        note: a.note,
        worker: await workerCounts(app.db, a.workerId),
        created_at: a.createdAt.toISOString(),
      })),
    ),
  };
}

// ---------- seats ----------

/** The lowest seat number with no live or released worker, or null when every seat is taken or paid. */
async function freeSeatNo(tx: Db, t: TaskRow): Promise<{ seatNo: number; round: number } | null> {
  const seats = await seatsOf(tx, t.id);
  for (let n = 1; n <= t.seats; n++) {
    const rows = seats.filter((s) => s.seatNo === n);
    if (rows.some((s) => LIVE.includes(s.state as SeatState) || s.state === "RELEASED")) continue;
    return { seatNo: n, round: rows.length + 1 };
  }
  return null;
}

async function assignSeat(
  tx: Db,
  app: AppContext,
  t: TaskRow,
  workerId: string,
  applicationId: string | null,
): Promise<SeatRow> {
  const now = app.now();
  const free = await freeSeatNo(tx, t);
  if (!free) throw new ApiError("TASK_STATE_CONFLICT", { reason: "no_free_seat" });
  const id = newId("taskSeat");
  const [seat] = await tx
    .insert(schema.taskSeats)
    .values({
      id,
      taskId: t.id,
      seatNo: free.seatNo,
      round: free.round,
      workerId,
      applicationId,
      state: "ASSIGNED",
      taskIdHash: seatTaskIdHash(t.id, free.seatNo, free.round),
      assignedAt: now,
      dueAt: new Date(now.getTime() + t.completionWindowH * 3600_000),
    })
    .returning();
  if (!seat) throw new Error("insert returned no row");
  await enqueueJob(tx, "FUND_SEAT", `FUND_SEAT:${id}`, { seat_id: id }, now);
  await enqueueTaskWebhook(tx, now, t.credentialId, "task.seat_assigned", {
    task_id: t.id,
    seat_id: id,
    state: "ASSIGNED",
  });
  await appendAudit(tx, {
    verificationId: null,
    actorType: applicationId ? "requester" : "worker",
    actorRef: null,
    eventType: "worker_claimed",
    beforeState: null,
    afterState: "ASSIGNED",
    correlationId: t.id,
    metadata: { kind: "task", seat_id: id, seat_no: free.seatNo, round: free.round },
  });
  return seat;
}

export async function decideApplication(
  app: AppContext,
  auth: RequesterAuth,
  rawTaskId: string,
  rawAppId: string,
  decision: "accept" | "reject",
  reason: string | null,
) {
  await requireTasksEnabled(app.db);
  const own = await loadOwnTask(app.db, auth, rawTaskId);
  const appId = parseId("taskApplication", rawAppId);
  if (!appId) throw new ApiError("APPLICATION_NOT_FOUND");
  return app.db.transaction(async (tx) => {
    const t = await lockTaskRow(tx, own.id);
    const [a] = await tx
      .select()
      .from(schema.taskApplications)
      .where(and(eq(schema.taskApplications.id, appId), eq(schema.taskApplications.taskId, t.id)));
    if (!a) throw new ApiError("APPLICATION_NOT_FOUND");
    if (a.state !== "pending") throw new ApiError("TASK_STATE_CONFLICT", { application_state: a.state });
    const now = app.now();
    if (decision === "accept") {
      if (t.status !== "OPEN") throw new ApiError("TASK_STATE_CONFLICT", { task_status: t.status });
      await assignSeat(tx, app, t, a.workerId, a.id);
    }
    await tx
      .update(schema.taskApplications)
      .set({ state: decision === "accept" ? "accepted" : "rejected", decisionReason: reason, decidedAt: now })
      .where(eq(schema.taskApplications.id, a.id));
    return taskView(tx, app, t);
  });
}

async function loadOwnSeat(tx: Db, t: TaskRow, rawSeatId: string): Promise<SeatRow> {
  const id = parseId("taskSeat", rawSeatId);
  if (!id) throw new ApiError("SEAT_NOT_FOUND");
  await tx.execute(sql`select id from task_seats where id = ${id} for update`);
  const [s] = await tx
    .select()
    .from(schema.taskSeats)
    .where(and(eq(schema.taskSeats.id, id), eq(schema.taskSeats.taskId, t.id)));
  if (!s) throw new ApiError("SEAT_NOT_FOUND");
  return s;
}

/** A task.* webhook for a seat, to the key that owns the task. */
async function notify(tx: Db, now: Date, s: SeatRow, event: WebhookEvent, state: string) {
  const [t] = await tx
    .select({ credentialId: schema.marketTasks.credentialId })
    .from(schema.marketTasks)
    .where(eq(schema.marketTasks.id, s.taskId));
  if (t)
    await enqueueTaskWebhook(tx, now, t.credentialId, event, { task_id: s.taskId, seat_id: s.id, state });
}

/** RELEASED: the worker is paid (SETTLE_SEAT) and the seat's fee is kept. */
async function releaseSeat(tx: Db, app: AppContext, s: SeatRow, by: "requester" | "timeout" | "auto") {
  const now = app.now();
  await tx
    .update(schema.taskSeats)
    .set({ state: "RELEASED", releasedBy: by, decidedAt: now, reviewDueAt: null })
    .where(eq(schema.taskSeats.id, s.id));
  await enqueueJob(tx, "SETTLE_SEAT", `SETTLE_SEAT:${s.id}`, { seat_id: s.id }, now);
  await notify(tx, now, s, "task.released", "RELEASED");
  await appendAudit(tx, {
    verificationId: null,
    actorType: by === "requester" ? "requester" : "system",
    actorRef: null,
    eventType: "operator_action",
    beforeState: s.state,
    afterState: "RELEASED",
    correlationId: s.taskId,
    metadata: { kind: "task", action: "seat_released", seat_id: s.id, by },
  });
}

/** REJECTED / EXPIRED / CANCELLED: the seat's escrow goes back to the treasury; the seat number is free again. */
async function closeSeat(
  tx: Db,
  app: AppContext,
  s: SeatRow,
  state: "REJECTED" | "EXPIRED" | "CANCELLED",
  reason: string | null,
) {
  const now = app.now();
  await tx
    .update(schema.taskSeats)
    .set({ state, decidedAt: now, decisionReason: reason, reviewDueAt: null })
    .where(eq(schema.taskSeats.id, s.id));
  await enqueueJob(tx, "REFUND_SEAT", `REFUND_SEAT:${s.id}`, { seat_id: s.id }, now);
  if (state !== "CANCELLED") {
    await notify(tx, now, s, state === "REJECTED" ? "task.rejected" : "task.seat_expired", state);
  }
  await appendAudit(tx, {
    verificationId: null,
    actorType: state === "REJECTED" ? "requester" : "system",
    actorRef: null,
    eventType: "submission_rejected",
    beforeState: s.state,
    afterState: state,
    correlationId: s.taskId,
    metadata: { kind: "task", seat_id: s.id, reason },
  });
}

export async function decideSeat(
  app: AppContext,
  auth: RequesterAuth,
  rawTaskId: string,
  rawSeatId: string,
  decision: "release" | "request_changes" | "reject",
  reason: string | null,
) {
  await requireTasksEnabled(app.db);
  const own = await loadOwnTask(app.db, auth, rawTaskId);
  return app.db.transaction(async (tx) => {
    const t = await lockTaskRow(tx, own.id);
    const s = await loadOwnSeat(tx, t, rawSeatId);
    if (s.state !== "IN_REVIEW") throw new ApiError("TASK_STATE_CONFLICT", { seat_state: s.state });
    if (decision === "release") {
      await releaseSeat(tx, app, s, "requester");
    } else if (decision === "reject") {
      await closeSeat(tx, app, s, "REJECTED", reason);
    } else {
      if (s.revisions >= MAX_REVISIONS) {
        throw new ApiError("TASK_STATE_CONFLICT", { reason: "max_revisions", max: MAX_REVISIONS });
      }
      const now = app.now();
      await tx
        .update(schema.taskSeats)
        .set({
          state: "ASSIGNED",
          revisions: s.revisions + 1,
          reviewDueAt: null,
          decisionReason: reason,
          dueAt: new Date(now.getTime() + t.completionWindowH * 3600_000),
        })
        .where(eq(schema.taskSeats.id, s.id));
      await notify(tx, now, s, "task.changes_requested", "ASSIGNED");
    }
    await finishIfOver(tx, app, t);
    return taskView(tx, app, t);
  });
}

/** Stop new applicants. Live seats carry on; unfilled seat numbers go back to the balance at once. */
export async function cancelTask(app: AppContext, auth: RequesterAuth, rawId: string) {
  await requireTasksEnabled(app.db);
  const own = await loadOwnTask(app.db, auth, rawId);
  return app.db.transaction(async (tx) => {
    const t = await lockTaskRow(tx, own.id);
    if (t.status === "OPEN") {
      await tx
        .update(schema.marketTasks)
        .set({ status: "CANCELLED", updatedAt: app.now() })
        .where(eq(schema.marketTasks.id, t.id));
      await tx
        .update(schema.taskApplications)
        .set({ state: "rejected", decisionReason: "task cancelled", decidedAt: app.now() })
        .where(and(eq(schema.taskApplications.taskId, t.id), eq(schema.taskApplications.state, "pending")));
      t.status = "CANCELLED";
    }
    await finishIfOver(tx, app, t);
    const [fresh] = await tx.select().from(schema.marketTasks).where(eq(schema.marketTasks.id, t.id));
    return taskView(tx, app, fresh ?? t);
  });
}

/**
 * When no more work can happen on a closed or cancelled task, hand back every seat number that was never released
 * (price + fee each) and mark the task DONE. Idempotent: one REFUND row per seat number.
 */
async function finishIfOver(tx: Db, app: AppContext, t: TaskRow): Promise<void> {
  if (t.status === "OPEN" || t.status === "DONE") return;
  const seats = await seatsOf(tx, t.id);
  if (seats.some((s) => LIVE.includes(s.state as SeatState))) return;
  const perSeat = toMicro(t.price) + toMicro(t.feePerSeat);
  for (let n = 1; n <= t.seats; n++) {
    if (seats.some((s) => s.seatNo === n && s.state === "RELEASED")) continue;
    await tx
      .insert(schema.requesterLedger)
      .values({
        credentialId: t.credentialId,
        marketTaskId: t.id,
        seatId: seatKey(t.id, n),
        entryType: "REFUND",
        amount: microToDecimal(perSeat),
        asset: t.asset,
        createdAt: app.now(),
      })
      .onConflictDoNothing();
  }
  if (t.status === "CLOSED") {
    await tx
      .update(schema.marketTasks)
      .set({ status: "DONE", updatedAt: app.now() })
      .where(eq(schema.marketTasks.id, t.id));
  }
}

// ---------- workers ----------

export type PublicTaskView = Omit<TaskView, "seats" | "applications_pending" | "cost"> & {
  price: { asset: string; amount: string };
  seats_open: number;
  /** Over the last 30 days: how often this requester rejected, and how fast it decided (13 §5.4). */
  requester: { rejected_ratio: number | null; decided: number };
  mine: { application: string | null; seat_id: string | null; seat_state: SeatState | null };
};

async function requesterRecord(db: Db, credentialId: string, now: Date) {
  const since = new Date(now.getTime() - 30 * 24 * 3600_000);
  const rows = await db
    .select({ state: schema.taskSeats.state, n: sql<number>`count(*)::int` })
    .from(schema.taskSeats)
    .innerJoin(schema.marketTasks, eq(schema.marketTasks.id, schema.taskSeats.taskId))
    .where(
      and(
        eq(schema.marketTasks.credentialId, credentialId),
        inArray(schema.taskSeats.state, ["RELEASED", "REJECTED"]),
        sql`${schema.taskSeats.decidedAt} >= ${since.toISOString()}`,
      ),
    )
    .groupBy(schema.taskSeats.state);
  const released = Number(rows.find((r) => r.state === "RELEASED")?.n ?? 0);
  const rejected = Number(rows.find((r) => r.state === "REJECTED")?.n ?? 0);
  const decided = released + rejected;
  return { rejected_ratio: decided ? Math.round((rejected / decided) * 100) / 100 : null, decided };
}

async function publicTaskView(
  db: Db,
  app: AppContext,
  t: TaskRow,
  workerId: string,
): Promise<PublicTaskView> {
  const seats = await seatsOf(db, t.id);
  const taken = new Set(
    seats.filter((s) => LIVE.includes(s.state as SeatState) || s.state === "RELEASED").map((s) => s.seatNo),
  );
  const [application] = await db
    .select()
    .from(schema.taskApplications)
    .where(and(eq(schema.taskApplications.taskId, t.id), eq(schema.taskApplications.workerId, workerId)));
  const mine = seats.filter((s) => s.workerId === workerId).at(-1);
  return {
    task_id: t.id,
    kind: "task",
    status: t.status as TaskView["status"],
    title: t.title,
    description: t.description,
    completion_criteria: t.completionCriteria,
    evidence_types: t.evidenceTypes as TaskView["evidence_types"],
    area: t.area,
    remote_ok: t.remoteOk,
    selection_mode: t.selectionMode as TaskView["selection_mode"],
    release_mode: t.releaseMode as TaskView["release_mode"],
    completion_window_hours: t.completionWindowH,
    deadline: t.deadline.toISOString(),
    application_questions: t.applicationQuestions as TaskView["application_questions"],
    created_at: t.createdAt.toISOString(),
    price: { asset: t.asset, amount: fromMicro(toMicro(t.price)) },
    seats_open: t.status === "OPEN" ? t.seats - taken.size : 0,
    requester: await requesterRecord(db, t.credentialId, app.now()),
    mine: {
      application: application?.state ?? null,
      seat_id: mine?.id ?? null,
      seat_state: (mine?.state as SeatState | undefined) ?? null,
    },
  };
}

export async function listOpenTasksForWorker(app: AppContext, workerId: string) {
  await requireTasksEnabled(app.db);
  const now = app.now();
  const rows = await app.db
    .select()
    .from(schema.marketTasks)
    .where(
      and(eq(schema.marketTasks.status, "OPEN"), sql`${schema.marketTasks.deadline} > ${now.toISOString()}`),
    )
    .orderBy(desc(schema.marketTasks.createdAt))
    .limit(100);
  const views = await Promise.all(rows.map((t) => publicTaskView(app.db, app, t, workerId)));
  return { tasks: views.filter((v) => v.seats_open > 0 || v.mine.seat_id !== null) };
}

async function loadOpenTask(db: Db, rawId: string): Promise<TaskRow> {
  const id = parseId("marketTask", rawId);
  if (!id) throw new ApiError("TASK_NOT_FOUND");
  const [t] = await db.select().from(schema.marketTasks).where(eq(schema.marketTasks.id, id));
  if (!t) throw new ApiError("TASK_NOT_FOUND");
  return t;
}

export async function getTaskForWorker(app: AppContext, workerId: string, rawId: string) {
  await requireTasksEnabled(app.db);
  return publicTaskView(app.db, app, await loadOpenTask(app.db, rawId), workerId);
}

/** application mode: leave an application. first_come mode: take a free seat now. */
export async function applyToTask(
  app: AppContext,
  workerId: string,
  rawId: string,
  body: { answers: Record<string, string>; note?: string | undefined },
) {
  await requireTasksEnabled(app.db);
  const found = await loadOpenTask(app.db, rawId);
  return app.db.transaction(async (tx) => {
    const t = await lockTaskRow(tx, found.id);
    const now = app.now();
    if (t.status !== "OPEN" || t.deadline <= now)
      throw new ApiError("TASK_STATE_CONFLICT", { task_status: t.status });
    const questions = t.applicationQuestions as { id: string; required: boolean }[];
    for (const q of questions) {
      if (q.required && !body.answers[q.id]?.trim()) {
        throw new ApiError("VALIDATION_FAILED", { field: `answers.${q.id}`, reason: "required" });
      }
    }
    const answers = Object.fromEntries(
      questions.filter((q) => body.answers[q.id]).map((q) => [q.id, body.answers[q.id]]),
    );
    if (t.selectionMode === "first_come") {
      const live = (await seatsOf(tx, t.id)).find(
        (s) => s.workerId === workerId && LIVE.includes(s.state as SeatState),
      );
      if (live) return publicTaskView(tx, app, t, workerId);
      await assignSeat(tx, app, t, workerId, null);
      return publicTaskView(tx, app, t, workerId);
    }
    const applicationId = newId("taskApplication");
    const inserted = await tx
      .insert(schema.taskApplications)
      .values({
        id: applicationId,
        taskId: t.id,
        workerId,
        answers,
        note: body.note ?? null,
        state: "pending",
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: schema.taskApplications.id });
    if (inserted.length) {
      await enqueueTaskWebhook(tx, now, t.credentialId, "task.application_received", {
        task_id: t.id,
        application_id: applicationId,
        state: "pending",
      });
    }
    return publicTaskView(tx, app, t, workerId);
  });
}

export async function listMySeats(app: AppContext, workerId: string) {
  await requireTasksEnabled(app.db);
  const rows = await app.db
    .select()
    .from(schema.taskSeats)
    .where(eq(schema.taskSeats.workerId, workerId))
    .orderBy(desc(schema.taskSeats.assignedAt))
    .limit(100);
  return {
    seats: await Promise.all(
      rows.map(async (s) => {
        const [t] = await app.db.select().from(schema.marketTasks).where(eq(schema.marketTasks.id, s.taskId));
        return {
          ...(await seatView(app.db, app, s)),
          task_id: s.taskId,
          title: t?.title ?? "",
          price: t ? { asset: t.asset, amount: fromMicro(toMicro(t.price)) } : null,
        };
      }),
    ),
  };
}

/** The worker delivers. Manual tasks start the 24 h clock; auto tasks are released at once. */
export async function deliverSeat(
  app: AppContext,
  workerId: string,
  rawSeatId: string,
  body: { body: string; links: string[] },
) {
  await requireTasksEnabled(app.db);
  const seatId = parseId("taskSeat", rawSeatId);
  if (!seatId) throw new ApiError("SEAT_NOT_FOUND");
  const [found] = await app.db.select().from(schema.taskSeats).where(eq(schema.taskSeats.id, seatId));
  if (!found || found.workerId !== workerId) throw new ApiError("SEAT_NOT_FOUND");
  return app.db.transaction(async (tx) => {
    const t = await lockTaskRow(tx, found.taskId);
    const s = await loadOwnSeat(tx, t, seatId);
    if (s.state !== "ASSIGNED") throw new ApiError("TASK_STATE_CONFLICT", { seat_state: s.state });
    const policy = evaluateQuestion(body.body);
    if (!policy.ok) throw new ApiError("TASK_POLICY_VIOLATION", { rule_id: policy.ruleId });
    const now = app.now();
    await tx.insert(schema.taskSubmissions).values({
      id: newId("taskSubmission"),
      seatId: s.id,
      round: s.revisions,
      body: body.body,
      links: body.links,
      createdAt: now,
    });
    await tx
      .update(schema.taskSeats)
      .set({ state: "IN_REVIEW", submittedAt: now, reviewDueAt: new Date(now.getTime() + REVIEW_WINDOW_MS) })
      .where(eq(schema.taskSeats.id, s.id));
    await notify(tx, now, s, "task.submitted", "IN_REVIEW");
    if (t.releaseMode === "auto") await releaseSeat(tx, app, { ...s, state: "IN_REVIEW" }, "auto");
    const [fresh] = await tx.select().from(schema.taskSeats).where(eq(schema.taskSeats.id, s.id));
    return seatView(tx, app, fresh ?? s);
  });
}

// ---------- tick (13 §5.3) ----------

/**
 * Every minute: pay delivered seats whose 24 h passed (D2), free seats whose worker ran out of time, close tasks
 * past their deadline, and settle the books of tasks that are over. Times come from app.now(), never DB defaults.
 */
export async function sweepMarketTasks(
  app: AppContext,
): Promise<{ released: number; expired: number; closed: number }> {
  if (!(await flagEnabled(app.db, "tasks_enabled"))) return { released: 0, expired: 0, closed: 0 };
  const now = app.now();
  let released = 0;
  let expired = 0;
  let closed = 0;
  const due = await app.db
    .select({ id: schema.taskSeats.id, taskId: schema.taskSeats.taskId })
    .from(schema.taskSeats)
    .where(and(eq(schema.taskSeats.state, "IN_REVIEW"), lte(schema.taskSeats.reviewDueAt, now)))
    .limit(200);
  for (const d of due) {
    await app.db.transaction(async (tx) => {
      const t = await lockTaskRow(tx, d.taskId);
      const s = await loadOwnSeat(tx, t, d.id);
      if (s.state !== "IN_REVIEW" || !s.reviewDueAt || s.reviewDueAt > now) return;
      await releaseSeat(tx, app, s, "timeout");
      await finishIfOver(tx, app, t);
      released++;
    });
  }
  const late = await app.db
    .select({ id: schema.taskSeats.id, taskId: schema.taskSeats.taskId })
    .from(schema.taskSeats)
    .where(and(eq(schema.taskSeats.state, "ASSIGNED"), lte(schema.taskSeats.dueAt, now)))
    .limit(200);
  for (const d of late) {
    await app.db.transaction(async (tx) => {
      const t = await lockTaskRow(tx, d.taskId);
      const s = await loadOwnSeat(tx, t, d.id);
      if (s.state !== "ASSIGNED" || s.dueAt > now) return;
      await closeSeat(tx, app, s, "EXPIRED", "completion window passed");
      await finishIfOver(tx, app, t);
      expired++;
    });
  }
  const over = await app.db
    .select({ id: schema.marketTasks.id })
    .from(schema.marketTasks)
    .where(
      sql`(${schema.marketTasks.status} = 'OPEN' and ${schema.marketTasks.deadline} <= ${now.toISOString()})
          or ${schema.marketTasks.status} in ('CLOSED','CANCELLED')`,
    )
    .limit(200);
  for (const o of over) {
    await app.db.transaction(async (tx) => {
      const t = await lockTaskRow(tx, o.id);
      if (t.status === "OPEN" && t.deadline <= now) {
        await tx
          .update(schema.marketTasks)
          .set({ status: "CLOSED", updatedAt: now })
          .where(eq(schema.marketTasks.id, t.id));
        await tx
          .update(schema.taskApplications)
          .set({ state: "rejected", decisionReason: "deadline passed", decidedAt: now })
          .where(and(eq(schema.taskApplications.taskId, t.id), eq(schema.taskApplications.state, "pending")));
        t.status = "CLOSED";
        closed++;
      }
      await finishIfOver(tx, app, t);
    });
  }
  return { released, expired, closed };
}

// ---------- chain jobs (13 §6.3) ----------

export type SeatJobOutcome =
  | { kind: "done" }
  | { kind: "retry"; error: string; delayS?: number }
  | { kind: "dead"; error: string };

async function seatPayment(
  db: Db,
  seatId: string,
  kind: "FUND" | "SETTLE" | "REFUND",
  amount: bigint,
  now: Date,
) {
  const [existing] = await db
    .select()
    .from(schema.seatPayments)
    .where(and(eq(schema.seatPayments.seatId, seatId), eq(schema.seatPayments.kind, kind)));
  if (existing) return existing;
  const [row] = await db
    .insert(schema.seatPayments)
    .values({
      id: newId("seatPayment"),
      seatId,
      kind,
      amount: fromMicro(amount),
      status: "PENDING",
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [again] = await db
    .select()
    .from(schema.seatPayments)
    .where(and(eq(schema.seatPayments.seatId, seatId), eq(schema.seatPayments.kind, kind)));
  if (!again) throw new Error("seat payment insert failed");
  return again;
}

const onSigned = (app: AppContext, paymentId: string) => async (signature: string) => {
  await app.db
    .update(schema.seatPayments)
    .set({
      status: "SUBMITTED",
      signatures: sql`array_append(${schema.seatPayments.signatures}, ${signature})`,
    })
    .where(eq(schema.seatPayments.id, paymentId));
};

async function seatAndTask(db: Db, seatId: string) {
  const [s] = await db.select().from(schema.taskSeats).where(eq(schema.taskSeats.id, seatId));
  if (!s) return null;
  const [t] = await db.select().from(schema.marketTasks).where(eq(schema.marketTasks.id, s.taskId));
  return t ? { s, t } : null;
}

function assetFor(app: AppContext, t: TaskRow) {
  const a = app.config.assets.find((x) => x.symbol === t.asset);
  if (!a) throw new Error(`asset ${t.asset} is not enabled on this server (ASSETS_ENABLED)`);
  return a;
}

async function settlementOn(db: Db): Promise<boolean> {
  return flagEnabled(db, "settlement_enabled");
}

export async function runFundSeat(app: AppContext, seatId: string): Promise<SeatJobOutcome> {
  if (!(await settlementOn(app.db))) return { kind: "retry", error: "settlement_disabled", delayS: 60 };
  const st = await seatAndTask(app.db, seatId);
  if (!st || st.s.fundedAt) return { kind: "done" };
  const { s, t } = st;
  const price = toMicro(t.price);
  const pay = await seatPayment(app.db, s.id, "FUND", price, app.now());
  const r = await app.settlement().fundTask(
    {
      verificationId: s.id,
      taskIdHash: s.taskIdHash,
      requesterRefHash: sha256(t.credentialId),
      amountPerWitness: toBaseUnits(price, t.asset),
      asset: assetFor(app, t),
      requiredWitnesses: 1,
      quorum: 1,
      // past every review this seat can still go through: completion window × (1 + revisions) + 24 h each
      deadline: new Date(
        s.dueAt.getTime() +
          (MAX_REVISIONS + 1) * (t.completionWindowH * 3600_000 + REVIEW_WINDOW_MS) +
          CHAIN_MARGIN_MS,
      ),
    },
    onSigned(app, pay.id),
  );
  if (r.kind !== "confirmed") {
    await app.db
      .update(schema.seatPayments)
      .set({ status: "FAILED", lastError: r.error })
      .where(eq(schema.seatPayments.id, pay.id));
    return r.kind === "retry" ? { kind: "retry", error: r.error } : { kind: "dead", error: r.error };
  }
  const now = app.now();
  await app.db.transaction(async (tx) => {
    await tx
      .update(schema.seatPayments)
      .set({ status: "CONFIRMED", confirmedAt: now })
      .where(eq(schema.seatPayments.id, pay.id));
    await tx.update(schema.taskSeats).set({ fundedAt: now }).where(eq(schema.taskSeats.id, s.id));
  });
  return { kind: "done" };
}

export async function runSettleSeat(app: AppContext, seatId: string): Promise<SeatJobOutcome> {
  if (!(await settlementOn(app.db))) return { kind: "retry", error: "settlement_disabled", delayS: 60 };
  const st = await seatAndTask(app.db, seatId);
  if (st?.s.state !== "RELEASED") return { kind: "done" };
  const { s, t } = st;
  if (!s.fundedAt) return { kind: "retry", error: "seat not funded yet", delayS: 30 };
  const [w] = await app.db.select().from(schema.workers).where(eq(schema.workers.id, s.workerId));
  if (!w) return { kind: "dead", error: "worker missing" };
  const price = toMicro(t.price);
  const pay = await seatPayment(app.db, s.id, "SETTLE", price, app.now());
  if (pay.status === "CONFIRMED") return { kind: "done" };
  const delivery = await latestDelivery(app.db, s.id);
  const r = await app.settlement().finalizeAndSettle(
    {
      verificationId: s.id,
      taskIdHash: s.taskIdHash,
      outcome: "VERIFIED",
      evidenceRoot: createHash("sha256")
        .update(JSON.stringify(delivery ?? {}))
        .digest(),
      resultHash: createHash("sha256").update(`${s.id}:released:${s.releasedBy}`).digest(),
      recipients: [w.payoutPubkey],
    },
    onSigned(app, pay.id),
  );
  if (r.kind !== "confirmed") {
    await app.db
      .update(schema.seatPayments)
      .set({ status: "FAILED", lastError: r.error })
      .where(eq(schema.seatPayments.id, pay.id));
    return r.kind === "retry" ? { kind: "retry", error: r.error } : { kind: "dead", error: r.error };
  }
  await app.db
    .update(schema.seatPayments)
    .set({ status: "CONFIRMED", confirmedAt: app.now() })
    .where(eq(schema.seatPayments.id, pay.id));
  return { kind: "done" };
}

export async function runRefundSeat(app: AppContext, seatId: string): Promise<SeatJobOutcome> {
  if (!(await settlementOn(app.db))) return { kind: "retry", error: "settlement_disabled", delayS: 60 };
  const st = await seatAndTask(app.db, seatId);
  if (!st || !["REJECTED", "EXPIRED", "CANCELLED"].includes(st.s.state)) return { kind: "done" };
  const { s, t } = st;
  if (!s.fundedAt) {
    // Never escrowed (or the fund is still in flight): wait for it, then refund what landed.
    const [fund] = await app.db
      .select()
      .from(schema.seatPayments)
      .where(and(eq(schema.seatPayments.seatId, s.id), eq(schema.seatPayments.kind, "FUND")));
    if (!fund || fund.status === "FAILED") {
      const onChain = await app.settlement().readTask(s.taskIdHash);
      if (!onChain) return { kind: "done" };
    } else if (fund.status !== "CONFIRMED") {
      return { kind: "retry", error: "seat funding in flight", delayS: 30 };
    }
  }
  const pay = await seatPayment(app.db, s.id, "REFUND", toMicro(t.price), app.now());
  if (pay.status === "CONFIRMED") return { kind: "done" };
  const r = await app
    .settlement()
    .refund({ verificationId: s.id, taskIdHash: s.taskIdHash, reason: "Cancelled" }, onSigned(app, pay.id));
  if (r.kind !== "confirmed") {
    await app.db
      .update(schema.seatPayments)
      .set({ status: "FAILED", lastError: r.error })
      .where(eq(schema.seatPayments.id, pay.id));
    return r.kind === "retry" ? { kind: "retry", error: r.error } : { kind: "dead", error: r.error };
  }
  await app.db
    .update(schema.seatPayments)
    .set({ status: "CONFIRMED", confirmedAt: app.now() })
    .where(eq(schema.seatPayments.id, pay.id));
  return { kind: "done" };
}
