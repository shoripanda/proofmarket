import "server-only";
// A requester's preferred and blocked workers (docs/architecture 14 §4). Per principal, so every key of a
// requester shares them. The worker is never told; a blocked worker simply does not see the requester's tasks.

import { createHmac } from "node:crypto";
import { ApiError, parseId, type WorkerPrefKind } from "@proofmarket/core";
import type { SetWorkerPreferenceRequest } from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { witnessRef } from "./crypto";
import { requireTasksEnabled } from "./market-task-service";

type TaskLike = { principalId: string; audience: string };

/** A stable handle for one requester's mark on one worker, so a mark can be cleared without any worker id. */
export function prefRef(salt: string, principalId: string, workerId: string): string {
  return `pref_${createHmac("sha256", salt).update(`pref:${principalId}:${workerId}`).digest("hex").slice(0, 32)}`;
}

/** Every requester's mark on this worker, by principal. */
export async function marksOnWorker(db: Db, workerId: string): Promise<Map<string, WorkerPrefKind>> {
  const rows = await db
    .select({ p: schema.requesterWorkerPrefs.principalId, kind: schema.requesterWorkerPrefs.kind })
    .from(schema.requesterWorkerPrefs)
    .where(eq(schema.requesterWorkerPrefs.workerId, workerId));
  return new Map(rows.map((r) => [r.p, r.kind as WorkerPrefKind]));
}

/** Whether the worker may apply to (or take) the task: not blocked, and preferred when the task asks for it. */
export function mayApply(t: TaskLike, marks: Map<string, WorkerPrefKind>): boolean {
  const mark = marks.get(t.principalId);
  if (mark === "block") return false;
  return t.audience === "everyone" || mark === "prefer";
}

/** The worker's preferred-by set for a requester's applicant list. */
export async function preferredAmong(db: Db, principalId: string, workerIds: string[]): Promise<Set<string>> {
  if (!workerIds.length) return new Set();
  const rows = await db
    .select({ w: schema.requesterWorkerPrefs.workerId })
    .from(schema.requesterWorkerPrefs)
    .where(
      and(
        eq(schema.requesterWorkerPrefs.principalId, principalId),
        eq(schema.requesterWorkerPrefs.kind, "prefer"),
        inArray(schema.requesterWorkerPrefs.workerId, workerIds),
      ),
    );
  return new Set(rows.map((r) => r.w));
}

export async function hasPreferredWorkers(db: Db, principalId: string): Promise<boolean> {
  const [row] = await db
    .select({ w: schema.requesterWorkerPrefs.workerId })
    .from(schema.requesterWorkerPrefs)
    .innerJoin(schema.workers, eq(schema.workers.id, schema.requesterWorkerPrefs.workerId))
    .where(
      and(
        eq(schema.requesterWorkerPrefs.principalId, principalId),
        eq(schema.requesterWorkerPrefs.kind, "prefer"),
        eq(schema.workers.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Find the worker a requester means: a public profile, a worker_ref from one of the requester's own tasks
 * (an applicant or a seat holder), or the pref_ref of an existing mark. A requester can only mark workers it has
 * met or who published a profile.
 */
async function resolveWorker(
  app: AppContext,
  auth: RequesterAuth,
  target: SetWorkerPreferenceRequest["worker"],
) {
  const db = app.db;
  if ("public_id" in target) {
    const [row] = await db
      .select({ w: schema.workerProfiles.workerId })
      .from(schema.workerProfiles)
      .where(
        and(eq(schema.workerProfiles.publicId, target.public_id), eq(schema.workerProfiles.public, true)),
      );
    if (row) return row.w;
  } else if ("pref_ref" in target) {
    const rows = await db
      .select({ w: schema.requesterWorkerPrefs.workerId })
      .from(schema.requesterWorkerPrefs)
      .where(eq(schema.requesterWorkerPrefs.principalId, auth.principalId));
    const hit = rows.find(
      (r) => prefRef(app.config.workerRefSalt, auth.principalId, r.w) === target.pref_ref,
    );
    if (hit) return hit.w;
  } else {
    const taskId = parseId("marketTask", target.task_id);
    if (taskId) {
      const [t] = await db
        .select({ id: schema.marketTasks.id })
        .from(schema.marketTasks)
        .where(and(eq(schema.marketTasks.id, taskId), eq(schema.marketTasks.principalId, auth.principalId)));
      if (t) {
        const [apps, seats] = await Promise.all([
          db
            .select({ w: schema.taskApplications.workerId })
            .from(schema.taskApplications)
            .where(eq(schema.taskApplications.taskId, t.id)),
          db
            .select({ w: schema.taskSeats.workerId })
            .from(schema.taskSeats)
            .where(eq(schema.taskSeats.taskId, t.id)),
        ]);
        const met = new Set([...apps, ...seats].map((r) => r.w));
        const hit = [...met].find((w) => witnessRef(app.config.workerRefSalt, w, t.id) === target.worker_ref);
        if (hit) return hit;
      }
    }
  }
  throw new ApiError("WORKER_NOT_FOUND");
}

export async function setWorkerPreference(
  app: AppContext,
  auth: RequesterAuth,
  body: SetWorkerPreferenceRequest,
) {
  await requireTasksEnabled(app.db);
  const workerId = await resolveWorker(app, auth, body.worker);
  const key = and(
    eq(schema.requesterWorkerPrefs.principalId, auth.principalId),
    eq(schema.requesterWorkerPrefs.workerId, workerId),
  );
  if (body.kind === "clear") {
    await app.db.delete(schema.requesterWorkerPrefs).where(key);
  } else {
    await app.db
      .insert(schema.requesterWorkerPrefs)
      .values({ principalId: auth.principalId, workerId, kind: body.kind, createdAt: app.now() })
      .onConflictDoUpdate({
        target: [schema.requesterWorkerPrefs.principalId, schema.requesterWorkerPrefs.workerId],
        set: { kind: body.kind, createdAt: app.now() },
      });
  }
  return {
    pref_ref: prefRef(app.config.workerRefSalt, auth.principalId, workerId),
    kind: body.kind === "clear" ? null : body.kind,
  };
}

export async function listWorkerPreferences(app: AppContext, auth: RequesterAuth) {
  await requireTasksEnabled(app.db);
  const rows = await app.db
    .select({
      w: schema.requesterWorkerPrefs.workerId,
      kind: schema.requesterWorkerPrefs.kind,
      at: schema.requesterWorkerPrefs.createdAt,
      publicId: schema.workerProfiles.publicId,
      isPublic: schema.workerProfiles.public,
      name: schema.workerProfiles.displayName,
    })
    .from(schema.requesterWorkerPrefs)
    .leftJoin(schema.workerProfiles, eq(schema.workerProfiles.workerId, schema.requesterWorkerPrefs.workerId))
    .where(eq(schema.requesterWorkerPrefs.principalId, auth.principalId))
    .orderBy(desc(schema.requesterWorkerPrefs.createdAt))
    .limit(500);
  return {
    workers: rows.map((r) => ({
      pref_ref: prefRef(app.config.workerRefSalt, auth.principalId, r.w),
      kind: r.kind as WorkerPrefKind,
      // Only a profile the worker keeps public is named; otherwise the requester sees the handle alone.
      public_id: r.isPublic ? r.publicId : null,
      display_name: r.isPublic ? r.name : null,
      created_at: r.at.toISOString(),
    })),
  };
}
