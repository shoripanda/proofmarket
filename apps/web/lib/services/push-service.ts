import "server-only";
// Push notifications for new work and for a worker's own task seats (04 §3.22, 05 §1, docs/architecture 15). Workers pick coarse areas; no worker location is used.
// Endpoints are encrypted at rest and limited to known browser push services so the server cannot be pointed
// at arbitrary URLs (SSRF).

import {
  ApiError,
  AREA_LABELS,
  areaOf,
  newId,
  PARTICIPATION_AREAS,
  type ParticipationArea,
  type WorkerPrefKind,
} from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, arrayContains, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context";
import { isLang, type Lang, langHref } from "../lang";
import { decryptBytes, encryptBytes, sha256 } from "./crypto";
import { flagEnabled } from "./flags";
import { mayApply } from "./prefs-service";
import { enqueueJob } from "./task-engine";

/** English names for the coarse areas (the Japanese ones are AREA_LABELS in core). */
const AREA_LABELS_EN: Record<ParticipationArea, string> = {
  shibuya: "around Shibuya",
  shinjuku: "around Shinjuku",
  other: "elsewhere in central Tokyo",
};

/** Hosts of the push services that Chrome/Android, Safari/iOS, Firefox and Edge hand out. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /\.push\.apple\.com$/,
  /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

const SubscriptionSchema = z.object({
  endpoint: z.url().max(1000).refine(isAllowedPushEndpoint, "unsupported push service"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const PutSchema = z
  .object({
    subscription: SubscriptionSchema.loose(),
    // No area at all is fine: such a worker only hears about work that needs no place (01 §4.20).
    areas: z
      .array(z.enum(PARTICIPATION_AREAS))
      .max(PARTICIPATION_AREAS.length)
      .refine((a) => new Set(a).size === a.length, "duplicate areas"),
    // The language the app is shown in; the notification is written in it (13 §7).
    lang: z.enum(["ja", "en"]).default("ja"),
  })
  .strict();

function invalid(e: z.ZodError): never {
  throw new ApiError("VALIDATION_FAILED", {
    issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

export function pushStatus(app: AppContext) {
  return { available: app.push !== null };
}

export async function savePushSubscription(app: AppContext, workerId: string, raw: unknown) {
  if (!app.push) throw new ApiError("FEATURE_DISABLED", { feature: "push" });
  const r = PutSchema.safeParse(raw);
  if (!r.success) invalid(r.error);
  const { endpoint, keys } = r.data.subscription;
  const enc = encryptBytes(
    app.config.locationEncKey,
    Buffer.from(JSON.stringify({ endpoint, keys }), "utf8"),
  );
  await app.db
    .insert(schema.pushSubscriptions)
    .values({
      id: newId("pushSubscription"),
      workerId,
      endpointHash: sha256(endpoint),
      endpointEnc: enc,
      areas: r.data.areas,
      lang: r.data.lang,
      createdAt: app.now(),
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpointHash,
      set: { workerId, endpointEnc: enc, areas: r.data.areas, lang: r.data.lang, failures: 0 },
    });
  return { ok: true as const, areas: r.data.areas };
}

export async function deletePushSubscription(app: AppContext, workerId: string, raw: unknown) {
  const r = z.object({ endpoint: z.string().max(1000) }).safeParse(raw);
  if (!r.success) invalid(r.error);
  await app.db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.endpointHash, sha256(r.data.endpoint)),
        eq(schema.pushSubscriptions.workerId, workerId),
      ),
    );
  return { ok: true as const };
}

const jst = (d: Date) =>
  d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
const jstDay = (d: Date) =>
  d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
/** "0.5" from "0.500000": rewards are stored with 6 decimals, shown without trailing zeros. */
const amountText = (raw: string | number) => String(Number(raw));

type SubRow = typeof schema.pushSubscriptions.$inferSelect;
type Payload = { title: string; body: string; url: string; tag: string };

/** Send each subscription the text in its app's language (13 §7); drop gone endpoints, count failures. */
async function sendAll(app: AppContext, subs: SubRow[], payloads: Record<Lang, Payload>): Promise<number> {
  if (!app.push) return 0;
  let sent = 0;
  for (const s of subs) {
    const sub = JSON.parse(decryptBytes(app.config.locationEncKey, s.endpointEnc).toString("utf8"));
    const res = await app.push.send(sub, JSON.stringify(payloads[isLang(s.lang) ? s.lang : "ja"]));
    if (res.ok) {
      sent++;
      await app.db
        .update(schema.pushSubscriptions)
        .set({ lastSentAt: app.now(), failures: 0 })
        .where(eq(schema.pushSubscriptions.id, s.id));
    } else if (res.gone) {
      await app.db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
    } else {
      await app.db
        .update(schema.pushSubscriptions)
        .set({ failures: sql`${schema.pushSubscriptions.failures} + 1` })
        .where(eq(schema.pushSubscriptions.id, s.id));
    }
  }
  return sent;
}

/** NOTIFY_WORKERS job. Best effort, sent once: a missed push is still visible in the task list. */
export async function runNotifyWorkers(app: AppContext, verificationId: string): Promise<{ sent: number }> {
  if (!app.push) return { sent: 0 };
  const [task] = await app.db
    .select()
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.id, verificationId));
  if (!task || task.status !== "OPEN" || task.deadline <= app.now()) return { sent: 0 };
  // Work that can be done anywhere (01 §4.15) goes to every subscribed worker regardless of area.
  const area: ParticipationArea | null =
    task.targetLat !== null && task.targetLng !== null
      ? areaOf({ lat: task.targetLat, lng: task.targetLng })
      : null;
  const subs = await app.db
    .select({ s: schema.pushSubscriptions })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.workers, eq(schema.workers.id, schema.pushSubscriptions.workerId))
    .where(
      area
        ? and(eq(schema.workers.status, "active"), arrayContains(schema.pushSubscriptions.areas, [area]))
        : eq(schema.workers.status, "active"),
    );
  // The reward is in the request's own currency (16 §3), never assumed to be USDC.
  const reward = `${amountText(task.bountyAmount)} ${task.bountyAsset}`;
  const sent = await sendAll(
    app,
    subs.map((r) => r.s),
    {
      ja: {
        title: area ? "近くで新しい依頼" : "新しい依頼（場所を問わない作業）",
        body: `${area ? AREA_LABELS[area] : "どこでも"}・1人 ${reward}・${jst(task.deadline)} まで`,
        url: `/tasks/${task.id}`,
        tag: task.id,
      },
      en: {
        title: area ? "New request nearby" : "New request (no particular place)",
        body: `${area ? AREA_LABELS_EN[area] : "Anywhere"} · ${reward} per person · until ${jst(task.deadline)} JST`,
        url: langHref("en", `/tasks/${task.id}`),
        tag: task.id,
      },
    },
  );
  return { sent };
}

// ---------- general tasks (docs/architecture 15) ----------

/** What happened to a worker's own seat. Each is pushed to that worker only. */
export const SEAT_PUSH_EVENTS = ["assigned", "changes_requested", "rejected", "released", "message"] as const;
export type SeatPushEvent = (typeof SEAT_PUSH_EVENTS)[number];

/** Queue the "new task" push when a general task opens (15 §2). Same job kind, told apart by its payload. */
export async function enqueueMarketTaskPush(tx: Db, taskId: string, now: Date): Promise<void> {
  await enqueueJob(tx, "NOTIFY_WORKERS", `NOTIFY_WORKERS:task:${taskId}`, { market_task_id: taskId }, now);
}

/** Queue a push to the seat's worker (15 §3). The time in the key lets repeated events (messages) each go out. */
export async function enqueueSeatPush(
  tx: Db,
  seatId: string,
  event: SeatPushEvent,
  now: Date,
): Promise<void> {
  await enqueueJob(
    tx,
    "NOTIFY_WORKERS",
    `NOTIFY_WORKERS:seat:${seatId}:${event}:${now.getTime()}`,
    { seat_id: seatId, event },
    now,
  );
}

/**
 * A new general task, to the workers who may apply (14 §5): not blocked by the requester, and preferred when the
 * task is preferred-only. Work tied to an area goes to workers who chose at least one area; work that can be
 * done anywhere goes to every subscriber. The title and description are never in the text.
 */
export async function runNotifyMarketTask(app: AppContext, taskId: string): Promise<{ sent: number }> {
  if (!app.push || !(await flagEnabled(app.db, "tasks_enabled"))) return { sent: 0 };
  const [t] = await app.db.select().from(schema.marketTasks).where(eq(schema.marketTasks.id, taskId));
  if (!t || t.status !== "OPEN" || t.deadline <= app.now()) return { sent: 0 };
  const anywhere = t.remoteOk || t.area === null;
  const rows = await app.db
    .select({ s: schema.pushSubscriptions })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.workers, eq(schema.workers.id, schema.pushSubscriptions.workerId))
    .where(
      anywhere
        ? eq(schema.workers.status, "active")
        : and(eq(schema.workers.status, "active"), sql`cardinality(${schema.pushSubscriptions.areas}) > 0`),
    );
  const marks = await marksByRequester(app.db, t.principalId);
  const subs = rows
    .map((r) => r.s)
    .filter((s) => {
      const mark = marks.get(s.workerId);
      return mayApply(t, new Map(mark ? [[t.principalId, mark]] : []));
    });
  const preferredOnly = t.audience === "preferred";
  const reward = `${amountText(t.price)} ${t.asset}`;
  const place = anywhere ? null : t.area;
  const sent = await sendAll(app, subs, {
    ja: {
      title: preferredOnly
        ? "あなたを推した依頼者から新しい仕事"
        : anywhere
          ? "新しい仕事（場所を問わない）"
          : "新しい仕事",
      body: `${place ?? "どこでも"}・1人 ${reward}・${jstDay(t.deadline)} まで`,
      url: `/jobs/${t.id}`,
      tag: `task:${t.id}`,
    },
    en: {
      title: preferredOnly
        ? "New task from a requester who picked you"
        : anywhere
          ? "New task (no particular place)"
          : "New task",
      body: `${place ?? "Anywhere"} · ${reward} per person · until ${jstDay(t.deadline)} JST`,
      url: langHref("en", `/jobs/${t.id}`),
      tag: `task:${t.id}`,
    },
  });
  return { sent };
}

/** Requester → worker marks, keyed by worker. */
async function marksByRequester(db: Db, principalId: string): Promise<Map<string, WorkerPrefKind>> {
  const rows = await db
    .select({ w: schema.requesterWorkerPrefs.workerId, kind: schema.requesterWorkerPrefs.kind })
    .from(schema.requesterWorkerPrefs)
    .where(eq(schema.requesterWorkerPrefs.principalId, principalId));
  return new Map(rows.map((r) => [r.w, r.kind as WorkerPrefKind]));
}

const SEAT_TEXT: Record<SeatPushEvent, { ja: string; en: string }> = {
  assigned: { ja: "応募が通りました", en: "You got the task" },
  changes_requested: { ja: "手直しの依頼が届きました", en: "The requester asked for changes" },
  rejected: { ja: "提出は受け入れられませんでした", en: "Your submission was not accepted" },
  released: { ja: "報酬が支払われます", en: "You are being paid" },
  message: { ja: "依頼者からメッセージが届きました", en: "New message from the requester" },
};

/** One of the worker's own seat events (15 §3). Message bodies and reasons are never in the text. */
export async function runNotifySeat(
  app: AppContext,
  seatId: string,
  event: SeatPushEvent,
): Promise<{ sent: number }> {
  if (!app.push || !SEAT_PUSH_EVENTS.includes(event) || !(await flagEnabled(app.db, "tasks_enabled")))
    return { sent: 0 };
  const [row] = await app.db
    .select({ s: schema.taskSeats, t: schema.marketTasks })
    .from(schema.taskSeats)
    .innerJoin(schema.marketTasks, eq(schema.marketTasks.id, schema.taskSeats.taskId))
    .where(eq(schema.taskSeats.id, seatId));
  if (!row) return { sent: 0 };
  const { s, t } = row;
  const subs = await app.db
    .select({ s: schema.pushSubscriptions })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.workers, eq(schema.workers.id, schema.pushSubscriptions.workerId))
    .where(and(eq(schema.pushSubscriptions.workerId, s.workerId), eq(schema.workers.status, "active")));
  const reward = `${amountText(t.price)} ${t.asset}`;
  const detail = (lang: Lang): string => {
    if (event === "assigned" || event === "changes_requested")
      return lang === "ja" ? `${jstDay(s.dueAt)} までに提出` : `Submit by ${jstDay(s.dueAt)} JST`;
    if (event === "released") return reward;
    if (event === "rejected")
      return lang === "ja" ? "理由は仕事の画面で見られます" : "See why on the task screen";
    return lang === "ja" ? "仕事の画面で読めます" : "Read it on the task screen";
  };
  const url = `/jobs/seats/${s.id}`;
  const sent = await sendAll(
    app,
    subs.map((r) => r.s),
    {
      ja: { title: SEAT_TEXT[event].ja, body: detail("ja"), url, tag: `seat:${s.id}` },
      en: { title: SEAT_TEXT[event].en, body: detail("en"), url: langHref("en", url), tag: `seat:${s.id}` },
    },
  );
  return { sent };
}
