import "server-only";
// Push notifications for new tasks (04 §3.22, 05 §1). Workers pick coarse areas; no worker location is used.
// Endpoints are encrypted at rest and limited to known browser push services so the server cannot be pointed
// at arbitrary URLs (SSRF).

import {
  ApiError,
  AREA_LABELS,
  areaOf,
  newId,
  PARTICIPATION_AREAS,
  type ParticipationArea,
} from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { and, arrayContains, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context";
import { isLang, type Lang, langHref } from "../lang";
import { decryptBytes, encryptBytes, sha256 } from "./crypto";

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
  // One text per language; each subscription gets the one its app is shown in (13 §7).
  const amount = Number(task.bountyAmount);
  const payloads: Record<Lang, string> = {
    ja: JSON.stringify({
      title: area ? "近くで新しい依頼" : "新しい依頼（場所を問わない作業）",
      body: `${area ? AREA_LABELS[area] : "どこでも"}・1人 ${amount} USDC・${jst(task.deadline)} まで`,
      url: `/tasks/${task.id}`,
      tag: task.id,
    }),
    en: JSON.stringify({
      title: area ? "New request nearby" : "New request (no particular place)",
      body: `${area ? AREA_LABELS_EN[area] : "Anywhere"} · ${amount} USDC per person · until ${jst(task.deadline)} JST`,
      url: langHref("en", `/tasks/${task.id}`),
      tag: task.id,
    }),
  };
  let sent = 0;
  for (const { s } of subs) {
    const sub = JSON.parse(decryptBytes(app.config.locationEncKey, s.endpointEnc).toString("utf8"));
    const res = await app.push.send(sub, payloads[isLang(s.lang) ? s.lang : "ja"]);
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
  return { sent };
}
