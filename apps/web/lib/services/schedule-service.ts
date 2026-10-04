import "server-only";
// Recurring checks (04 §3.23, 05 §1). Each due run goes through createVerification like any other request,
// so balance, spend limits, policy checks and funding apply unchanged.

import {
  ApiError,
  evaluateQuestion,
  newId,
  nextRunAt,
  parseId,
  validateAnswerSchema,
} from "@proofmarket/core";
import { CreateScheduleRequestSchema, CreateVerificationRequestSchema } from "@proofmarket/core/schemas/api";
import { schema } from "@proofmarket/db";
import { and, count, eq, lte } from "drizzle-orm";
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
});

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
  const now = app.now();
  const endsAt = b.ends_at ? new Date(b.ends_at) : null;
  if (endsAt && endsAt <= now) throw new ApiError("VALIDATION_FAILED", { field: "ends_at" });

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
        timesJst: [...new Set(b.times_jst)].sort(),
        daysJst: [...new Set(b.days_jst)].sort(),
        endsAt,
        nextRunAt: nextRunAt(b.times_jst, b.days_jst, now),
        createdAt: now,
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
        .set({ active: false })
        .where(
          and(
            eq(schema.verificationSchedules.id, id),
            eq(schema.verificationSchedules.credentialId, auth.credentialId),
          ),
        )
        .returning()
    : [];
  if (!row) throw new ApiError("VALIDATION_FAILED", { schedule: rawId, reason: "not found" });
  return view(row);
}

/** Called from tick. Returns the verification IDs created so the caller can kick their FUND_TASK jobs. */
export async function runDueSchedules(app: AppContext, max = 20): Promise<string[]> {
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
    const next = nextRunAt(s.timesJst, s.daysJst, now);
    const ended = s.endsAt !== null && next > s.endsAt;
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
    const stop = ended || failures >= MAX_FAILURES || error === "CREDENTIAL_SUSPENDED";
    await app.db
      .update(schema.verificationSchedules)
      .set({
        nextRunAt: next,
        lastRunAt: now,
        lastVerificationId: verificationId ?? s.lastVerificationId,
        lastError: error,
        consecutiveFailures: failures,
        active: !stop,
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
        metadata: { action: "schedule_run_failed", error, stopped: stop },
      });
    }
  }
  return created;
}
