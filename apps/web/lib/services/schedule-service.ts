import "server-only";
// Recurring checks (04 §3.23, 05 §1) and watches (01 §4.23). Each due run goes through createVerification like
// any other request, so balance, spend limits, policy checks and funding apply unchanged.

import {
  ApiError,
  evaluateQuestion,
  newId,
  nextRunAt,
  normalizeAnswer,
  parseId,
  validateAnswerSchema,
} from "@proofmarket/core";
import {
  type CreateScheduleRequest,
  CreateScheduleRequestSchema,
  CreateVerificationRequestSchema,
  type StopWhen,
} from "@proofmarket/core/schemas/api";
import { schema } from "@proofmarket/db";
import { and, count, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { credentialAuth, type RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { createVerification } from "./requester-service";

export const MAX_ACTIVE_SCHEDULES = 10;
const MAX_FAILURES = 3;

const BodySchema = CreateScheduleRequestSchema;

type Row = typeof schema.verificationSchedules.$inferSelect;
const view = (r: Row) => ({
  schedule_id: r.id,
  active: r.active,
  times_jst: r.timesJst,
  days_jst: r.daysJst,
  deadline_minutes: r.deadlineMinutes,
  ends_at: r.endsAt?.toISOString() ?? null,
  next_run_at: r.active ? r.nextRunAt.toISOString() : null,
  last_run_at: r.lastRunAt?.toISOString() ?? null,
  last_verification_id: r.lastVerificationId,
  last_error: r.lastError,
  every_minutes: r.everyMinutes,
  max_runs: r.maxRuns,
  runs: r.runs,
  stop_when: (r.stopWhen as StopWhen | null) ?? null,
  stopped_reason: (r.stoppedReason as StopReason | null) ?? null,
  matched_verification_id: r.matchedVerificationId,
});

type StopReason = "condition_met" | "max_runs" | "ended" | "failures" | "suspended" | "stopped";

/** The next due time: fixed Japan times, or now + the interval. */
function nextDue(s: Pick<Row, "timesJst" | "daysJst" | "everyMinutes">, from: Date): Date {
  if (s.everyMinutes !== null) return new Date(from.getTime() + s.everyMinutes * 60_000);
  return nextRunAt(s.timesJst, s.daysJst, from);
}

/** A stop condition must fit the answer the request asks for (01 §4.23). */
function checkStopWhen(request: CreateScheduleRequest["request"], stop: StopWhen): void {
  const spec = request.answer_schema;
  const bad = (reason: string, extra: Record<string, unknown> = {}) =>
    new ApiError("VALIDATION_FAILED", { field: "stop_when", reason, ...extra });
  if ("number" in stop) {
    if (spec.type !== "number") throw bad("number_condition_needs_number_answer");
    const { min, max } = stop.number;
    if (min !== undefined && max !== undefined && min > max) throw bad("min_greater_than_max");
    return;
  }
  if (spec.type !== "enum") throw bad("answer_condition_needs_choice_answer");
  const wanted = "answer" in stop ? [stop.answer] : stop.answer_in;
  const unknown = wanted.filter((v) => !spec.values.includes(v));
  if (unknown.length) throw bad("not_a_choice", { allowed: spec.values, unknown });
}

/** Does a VERIFIED answer satisfy the condition? */
export function stopWhenMatches(stop: StopWhen, answer: string): boolean {
  if ("number" in stop) {
    const n = Number(normalizeAnswer({ type: "number" }, answer));
    if (!Number.isFinite(n)) return false;
    const { min, max } = stop.number;
    return (min === undefined || n >= min) && (max === undefined || n <= max);
  }
  return "answer" in stop ? stop.answer === answer : stop.answer_in.includes(answer);
}

export async function createSchedule(app: AppContext, auth: RequesterAuth, raw: unknown) {
  const r = BodySchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const b = r.data;
  // Early checks so a schedule that can never run is refused now; every run is fully re-checked anyway.
  if (!auth.allowedTaskTypes.includes(b.request.type)) throw new ApiError("UNSUPPORTED_TASK_TYPE");
  if (b.request.principal_ref !== auth.principalId) throw new ApiError("PRINCIPAL_MISMATCH");
  validateAnswerSchema(b.request.type, b.request.answer_schema);
  const policy = evaluateQuestion(b.request.question);
  if (!policy.ok) throw new ApiError("TASK_POLICY_VIOLATION", { rule_id: policy.ruleId });
  if (b.stop_when) checkStopWhen(b.request, b.stop_when);
  const now = app.now();
  const endsAt = b.ends_at ? new Date(b.ends_at) : null;
  if (endsAt && endsAt <= now) throw new ApiError("VALIDATION_FAILED", { field: "ends_at" });
  const interval = b.every_minutes ?? null;

  return app.db.transaction(async (tx) => {
    const [n] = await tx
      .select({ n: count() })
      .from(schema.verificationSchedules)
      .where(
        and(
          eq(schema.verificationSchedules.credentialId, auth.credentialId),
          eq(schema.verificationSchedules.active, true),
        ),
      );
    if ((n?.n ?? 0) >= MAX_ACTIVE_SCHEDULES) {
      throw new ApiError("VALIDATION_FAILED", { reason: "too_many_schedules", max: MAX_ACTIVE_SCHEDULES });
    }
    const [row] = await tx
      .insert(schema.verificationSchedules)
      .values({
        id: newId("schedule"),
        credentialId: auth.credentialId,
        template: b.request,
        deadlineMinutes: b.deadline_minutes,
        timesJst: [...new Set(b.times_jst ?? [])].sort(),
        daysJst: [...new Set(b.days_jst ?? [])].sort(),
        endsAt,
        // A watch starts right away; fixed times wait for the first one.
        nextRunAt: interval !== null ? now : nextRunAt(b.times_jst ?? [], b.days_jst ?? [], now),
        createdAt: now,
        everyMinutes: interval,
        maxRuns: b.max_runs ?? null,
        stopWhen: b.stop_when ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return view(row);
  });
}

export async function listSchedules(app: AppContext, auth: RequesterAuth) {
  const rows = await app.db
    .select()
    .from(schema.verificationSchedules)
    .where(eq(schema.verificationSchedules.credentialId, auth.credentialId));
  return { schedules: rows.map(view) };
}

export async function stopSchedule(app: AppContext, auth: RequesterAuth, rawId: string) {
  const id = parseId("schedule", rawId);
  const [row] = id
    ? await app.db
        .update(schema.verificationSchedules)
        .set({ active: false, stoppedReason: "stopped" })
        .where(
          and(
            eq(schema.verificationSchedules.id, id),
            eq(schema.verificationSchedules.credentialId, auth.credentialId),
            eq(schema.verificationSchedules.active, true),
          ),
        )
        .returning()
    : [];
  if (!row) throw new ApiError("VALIDATION_FAILED", { schedule: rawId, reason: "not found" });
  return view(row);
}

/**
 * Called from tick. Stops watches whose last result matched their condition (01 §4.23), then runs due schedules.
 * Returns the verification IDs created so the caller can kick their FUND_TASK jobs.
 */
export async function runDueSchedules(app: AppContext, max = 20): Promise<string[]> {
  await settleWatches(app);
  const now = app.now();
  const due = await app.db
    .select()
    .from(schema.verificationSchedules)
    .where(
      and(eq(schema.verificationSchedules.active, true), lte(schema.verificationSchedules.nextRunAt, now)),
    )
    .limit(max);
  const created: string[] = [];
  for (const s of due) {
    const runAt = s.nextRunAt;
    const next = nextDue(s, now);
    let verificationId: string | null = null;
    let error: string | null = null;
    try {
      const auth = await credentialAuth(app, s.credentialId);
      const body = CreateVerificationRequestSchema.parse({
        ...(s.template as object),
        // A late tick bases the deadline on now so the task still gets its full window.
        deadline: new Date(
          (now.getTime() - runAt.getTime() > 60_000 ? now : runAt).getTime() + s.deadlineMinutes * 60_000,
        ).toISOString(),
      });
      const out = await app.db.transaction((tx) =>
        createVerification(app, tx, auth, body, `schedule:${s.id}:${runAt.toISOString()}`),
      );
      verificationId = out.body.verification_id;
      created.push(verificationId);
    } catch (e) {
      error = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
    }
    const failures = error ? s.consecutiveFailures + 1 : 0;
    const runs = s.runs + (verificationId ? 1 : 0);
    const reason: StopReason | null =
      error === "CREDENTIAL_SUSPENDED"
        ? "suspended"
        : failures >= MAX_FAILURES
          ? "failures"
          : s.maxRuns !== null && runs >= s.maxRuns
            ? "max_runs"
            : s.endsAt !== null && next > s.endsAt
              ? "ended"
              : null;
    await app.db
      .update(schema.verificationSchedules)
      .set({
        nextRunAt: next,
        lastRunAt: now,
        lastVerificationId: verificationId ?? s.lastVerificationId,
        lastError: error,
        consecutiveFailures: failures,
        runs,
        active: reason === null,
        stoppedReason: reason,
      })
      .where(eq(schema.verificationSchedules.id, s.id));
    if (error) {
      await appendAudit(app.db, {
        verificationId: null,
        actorType: "system",
        actorRef: null,
        eventType: "operator_action",
        beforeState: null,
        afterState: null,
        correlationId: s.id,
        metadata: { action: "schedule_run_failed", error, stopped: reason !== null },
      });
    }
  }
  return created;
}

/**
 * Watches whose newest task has a VERIFIED answer that matches stop_when are stopped and marked
 * condition_met. A schedule that already stopped for another reason keeps that reason; the requester
 * still sees the match through the task's own result and webhook.
 */
export async function settleWatches(app: AppContext): Promise<string[]> {
  const watches = await app.db
    .select()
    .from(schema.verificationSchedules)
    .where(
      and(
        eq(schema.verificationSchedules.active, true),
        isNotNull(schema.verificationSchedules.stopWhen),
        isNotNull(schema.verificationSchedules.lastVerificationId),
        isNull(schema.verificationSchedules.matchedVerificationId),
      ),
    );
  if (watches.length === 0) return [];
  const ids = watches.map((w) => w.lastVerificationId as string);
  const results = await app.db
    .select({
      verificationId: schema.verificationResults.verificationId,
      outcome: schema.verificationResults.outcome,
      answer: schema.verificationResults.finalAnswer,
    })
    .from(schema.verificationResults)
    .where(inArray(schema.verificationResults.verificationId, ids));
  const byId = new Map(results.map((r) => [r.verificationId, r]));
  const matched: string[] = [];
  for (const w of watches) {
    const r = byId.get(w.lastVerificationId as string);
    if (r?.outcome !== "VERIFIED" || r.answer === null) continue;
    if (!stopWhenMatches(w.stopWhen as StopWhen, r.answer)) continue;
    await app.db
      .update(schema.verificationSchedules)
      .set({ active: false, stoppedReason: "condition_met", matchedVerificationId: r.verificationId })
      .where(and(eq(schema.verificationSchedules.id, w.id), eq(schema.verificationSchedules.active, true)));
    matched.push(w.id);
  }
  return matched;
}
