import "server-only";
// Sign-ups from /join (04 §3.20, 05 §1). Email is stored encrypted and the row is deleted after 90 days.

import { createHmac } from "node:crypto";
import { ApiError, newId, PARTICIPATION_AREAS, PARTICIPATION_ROLES } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, desc, eq, gt, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context";
import { log } from "../log";
import { createPrincipal, issueApiKey, topUp } from "./admin-service";
import { decryptBytes, encryptBytes, sha256 } from "./crypto";
import { consumeRateLimit } from "./rate-limit";

/** Bump when the notice shown next to the form changes. */
export const PARTICIPATION_CONSENT_VERSION = "2026-10-04";
export const PARTICIPATION_RETENTION_DAYS = 90;

/**
 * A key issued from /join (01 §4.28): the runbook's numbers for hand-issued keys (12 §6). The two limits are
 * stored on the credential but no longer enforced (bounty caps were dropped); the balance is what bounds it.
 * The pilot runs on Devnet, so the starting balance is test USDC.
 */
export const EMAIL_KEY_LIMITS = { maxTaskAmount: "5", dailySpendLimit: "20", topUp: "20" } as const;
/** A second sign-up from the same address within this window sends nothing (stops mail bombing). */
const RESEND_QUIET_MS = 24 * 3_600_000;

const BodySchema = z
  .object({
    role: z.enum(PARTICIPATION_ROLES),
    email: z.email().max(254),
    area: z.enum(PARTICIPATION_AREAS).optional(),
    note: z.string().trim().max(500).optional(),
    consent: z.literal(true),
    /** Language of the reply email. */
    lang: z.enum(["ja", "en"]).optional(),
    /** Honeypot: hidden from people, filled by naive bots. */
    website: z.string().max(0).optional(),
  })
  .strict();

export async function createParticipationRequest(app: AppContext, raw: unknown, ip: string) {
  // The IP is only hashed for the rate-limit scope, never stored with the request.
  await consumeRateLimit(app, `participation:${sha256(ip).toString("hex").slice(0, 32)}`, 5);
  const r = BodySchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const b = r.data;
  const email = b.email.toLowerCase();
  const now = app.now();
  const row = {
    role: b.role,
    contactEnc: encryptBytes(app.config.locationEncKey, Buffer.from(email, "utf8")),
    contactHash: contactHash(app, email),
    area: b.role === "worker" ? (b.area ?? "other") : null,
    note: b.note || null,
    consentVersion: PARTICIPATION_CONSENT_VERSION,
    createdAt: now,
    deleteAfter: new Date(now.getTime() + PARTICIPATION_RETENTION_DAYS * 86_400_000),
  };
  if (b.role === "requester" && app.mailer) {
    await issueKeyByEmail(app, app.mailer, row, email, b.lang ?? "ja");
    return { ok: true as const, delivery: "email" as const };
  }
  await app.db.insert(schema.participationRequests).values({ id: newId("participation"), ...row });
  return { ok: true as const, delivery: "operator" as const };
}

/**
 * Requester sign-up -> API key by email, at once (01 §4.28). The key is only ever in the email: if the email
 * cannot be sent, the whole issue is rolled back and the caller gets EMAIL_NOT_SENT (nothing half-issued).
 * One key per address. A repeat sign-up gets a short notice instead (at most once a day), and the response is
 * the same either way, so the form does not reveal who has applied.
 */
async function issueKeyByEmail(
  app: AppContext,
  mailer: NonNullable<AppContext["mailer"]>,
  row: Omit<typeof schema.participationRequests.$inferInsert, "id"> & {
    contactHash: Buffer;
    createdAt: Date;
  },
  email: string,
  lang: "ja" | "en",
) {
  const earlier = await app.db
    .select({ createdAt: schema.participationRequests.createdAt })
    .from(schema.participationRequests)
    .where(
      and(
        eq(schema.participationRequests.contactHash, row.contactHash),
        isNotNull(schema.participationRequests.credentialId),
      ),
    )
    .orderBy(desc(schema.participationRequests.createdAt))
    .limit(1);
  if (earlier[0]) {
    const recent = await app.db
      .select({ id: schema.participationRequests.id })
      .from(schema.participationRequests)
      .where(
        and(
          eq(schema.participationRequests.contactHash, row.contactHash),
          gt(schema.participationRequests.createdAt, new Date(row.createdAt.getTime() - RESEND_QUIET_MS)),
        ),
      )
      .limit(1);
    await app.db
      .insert(schema.participationRequests)
      .values({ id: newId("participation"), ...row, status: "closed" });
    if (!recent[0]) {
      const sent = await mailer.send({ to: email, ...alreadyIssuedMail(lang, earlier[0].createdAt) });
      if (!sent.ok) log("warn", "participation.notice_not_sent", { reason: sent.reason });
    }
    return;
  }
  await app.db.transaction(async (tx) => {
    const id = newId("participation");
    const principalId = await createPrincipal(tx, {
      displayName: `signup:${id.slice(-8)}`,
      type: "person",
    });
    const { credentialId, apiKey } = await issueApiKey(tx, {
      principalId,
      requesterName: "signup",
      maxTaskAmount: EMAIL_KEY_LIMITS.maxTaskAmount,
      dailySpendLimit: EMAIL_KEY_LIMITS.dailySpendLimit,
      operator: "signup-email",
    });
    await topUp(tx, credentialId, EMAIL_KEY_LIMITS.topUp);
    await tx.insert(schema.participationRequests).values({ id, ...row, status: "contacted", credentialId });
    const sent = await mailer.send({ to: email, ...keyMail(lang, apiKey) });
    if (!sent.ok) {
      log("warn", "participation.key_not_sent", { reason: sent.reason });
      throw new ApiError("EMAIL_NOT_SENT");
    }
  });
}

function contactHash(app: AppContext, email: string): Buffer {
  return createHmac("sha256", app.config.locationEncKey).update(`participation-contact:${email}`).digest();
}

const BASE_URL = () => process.env.NEXT_PUBLIC_BASE_URL ?? "https://proofmarket.fun";

function keyMail(lang: "ja" | "en", apiKey: string): { subject: string; text: string } {
  const l = EMAIL_KEY_LIMITS;
  if (lang === "en") {
    return {
      subject: "Your ProofMarket API key",
      text: [
        "Thank you for signing up. Here is your requester API key.",
        "",
        apiKey,
        "",
        "This is the only copy. We store only a hash of it, so we cannot show it again. Keep it somewhere safe.",
        "",
        `Starting balance: ${l.topUp} USDC (Devnet test USDC, no real money)`,
        "",
        `How to send your first request: ${BASE_URL()}/developers`,
        "",
        "If you did not sign up, someone entered your address by mistake. You can ignore this email.",
      ].join("\n"),
    };
  }
  return {
    subject: "ProofMarket の API キーをお送りします",
    text: [
      "お申し込みありがとうございます。依頼者用の API キーです。",
      "",
      apiKey,
      "",
      "このキーを見られるのは、このメールだけです。運営者の側にもキーそのものは残っていないので、なくさないように保管してください。",
      "",
      `最初の残高：${l.topUp} USDC（Devnet の試験用 USDC で、本物のお金ではありません）`,
      "",
      `依頼の出し方：${BASE_URL()}/developers`,
      "",
      "心当たりがない場合は、どなたかが誤ってこのアドレスを入力したものです。このメールは無視してかまいません。",
    ].join("\n"),
  };
}

function alreadyIssuedMail(lang: "ja" | "en", at: Date): { subject: string; text: string } {
  const day = at.toISOString().slice(0, 10);
  if (lang === "en") {
    return {
      subject: "Your ProofMarket API key was already sent",
      text: [
        `An API key was already sent to this address on ${day}. We send one key per address.`,
        'Please look for the email titled "Your ProofMarket API key".',
        "",
        "If you did not sign up, you can ignore this email.",
      ].join("\n"),
    };
  }
  return {
    subject: "ProofMarket の API キーは送信済みです",
    text: [
      `このアドレスには ${day} に API キーをお送りしています。キーは 1 つのアドレスに 1 つです。`,
      "「ProofMarket の API キーをお送りします」という件名のメールを探してください。",
      "",
      "心当たりがない場合は、このメールは無視してかまいません。",
    ].join("\n"),
  };
}

/** Operator view for scripts/list-participation.ts. Decrypts contact addresses. */
export async function listParticipationRequests(db: Db, encKey: Buffer, status = "new") {
  const rows = await db
    .select()
    .from(schema.participationRequests)
    .where(eq(schema.participationRequests.status, status));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    email: decryptBytes(encKey, r.contactEnc).toString("utf8"),
    area: r.area,
    note: r.note,
    created_at: r.createdAt.toISOString(),
  }));
}

export async function setParticipationStatus(db: Db, id: string, status: "contacted" | "closed") {
  const r = await db
    .update(schema.participationRequests)
    .set({ status })
    .where(eq(schema.participationRequests.id, id))
    .returning({ id: schema.participationRequests.id });
  if (!r.length) throw new ApiError("VALIDATION_FAILED", { participation: id, reason: "not found" });
}

export async function purgeExpiredParticipation(app: AppContext): Promise<number> {
  const r = await app.db
    .delete(schema.participationRequests)
    .where(lte(schema.participationRequests.deleteAfter, app.now()))
    .returning({ id: schema.participationRequests.id });
  return r.length;
}
