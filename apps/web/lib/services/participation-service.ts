import "server-only";
// Sign-ups from /join (04 §3.20, 05 §1). Email is stored encrypted and the row is deleted after 90 days.

import { createHmac } from "node:crypto";
import { ApiError, newId, PARTICIPATION_AREAS, PARTICIPATION_ROLES } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context";
import { log } from "../log";
import { createPrincipal, issueApiKey, topUp } from "./admin-service";
import { decryptBytes, encryptBytes, sha256 } from "./crypto";
import { consumeDailyLimit, consumeRateLimit } from "./rate-limit";

/** Bump when the notice shown next to the form changes. */
export const PARTICIPATION_CONSENT_VERSION = "2026-10-04";
export const PARTICIPATION_RETENTION_DAYS = 90;

/**
 * A key issued from /join (01 §4.28). Anyone can get one at once, so the starting balance is a trial amount
 * (10 requests at the usual 0.5 USDC), and one network can get at most KEYS_PER_IP_PER_DAY a day. The two
 * limits are stored on the credential but are no longer enforced (bounty caps were dropped); the balance is
 * what bounds it. The pilot runs on Devnet, so the balance is test USDC.
 */
export const SIGNUP_KEY = { maxTaskAmount: "5", dailySpendLimit: "20", trialBalance: "5" } as const;
export const KEYS_PER_IP_PER_DAY = 3;

const BodySchema = z
  .object({
    role: z.enum(PARTICIPATION_ROLES),
    email: z.email().max(254),
    area: z.enum(PARTICIPATION_AREAS).optional(),
    note: z.string().trim().max(500).optional(),
    consent: z.literal(true),
    /** Language of the copy emailed with the key. */
    lang: z.enum(["ja", "en"]).optional(),
    /** Honeypot: hidden from people, filled by naive bots. */
    website: z.string().max(0).optional(),
  })
  .strict();

export type ParticipationResult =
  | { ok: true; delivery: "operator" }
  | {
      ok: true;
      delivery: "screen";
      api_key: string;
      principal_ref: string;
      trial_balance: string;
      emailed: boolean;
    };

export async function createParticipationRequest(
  app: AppContext,
  raw: unknown,
  ip: string,
): Promise<ParticipationResult> {
  // The IP is only hashed for the rate-limit scope, never stored with the request.
  const ipScope = sha256(ip).toString("hex").slice(0, 32);
  await consumeRateLimit(app, `participation:${ipScope}`, 5);
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
  if (b.role === "worker") {
    await app.db.insert(schema.participationRequests).values({ id: newId("participation"), ...row });
    return { ok: true, delivery: "operator" };
  }
  await consumeDailyLimit(app, `signup-key:${ipScope}`, KEYS_PER_IP_PER_DAY);
  const { apiKey, principalId } = await app.db.transaction(async (tx) => {
    const id = newId("participation");
    const principalId = await createPrincipal(tx, { displayName: `signup:${id.slice(-8)}`, type: "person" });
    const issued = await issueApiKey(tx, {
      principalId,
      requesterName: "signup",
      maxTaskAmount: SIGNUP_KEY.maxTaskAmount,
      dailySpendLimit: SIGNUP_KEY.dailySpendLimit,
      operator: "signup",
    });
    await topUp(tx, issued.credentialId, SIGNUP_KEY.trialBalance);
    await tx
      .insert(schema.participationRequests)
      .values({ id, ...row, status: "contacted", credentialId: issued.credentialId });
    return { apiKey: issued.apiKey, principalId };
  });
  // The key is shown on the page; the email is a copy. A failed send never takes the key back.
  let emailed = false;
  if (app.mailer) {
    const sent = await app.mailer.send({ to: email, ...keyMail(b.lang ?? "ja", apiKey, principalId) });
    emailed = sent.ok;
    if (!sent.ok) log("warn", "participation.key_not_sent", { reason: sent.reason });
  }
  return {
    ok: true,
    delivery: "screen",
    api_key: apiKey,
    principal_ref: principalId,
    trial_balance: SIGNUP_KEY.trialBalance,
    emailed,
  };
}

function contactHash(app: AppContext, email: string): Buffer {
  return createHmac("sha256", app.config.locationEncKey).update(`participation-contact:${email}`).digest();
}

const BASE_URL = () => process.env.NEXT_PUBLIC_BASE_URL ?? "https://proofmarket.fun";

function keyMail(lang: "ja" | "en", apiKey: string, principalRef: string): { subject: string; text: string } {
  const base = BASE_URL();
  const add = `claude mcp add --transport http proofmarket ${base}/mcp --header "Authorization: Bearer ${apiKey}"`;
  if (lang === "en") {
    return {
      subject: "Your ProofMarket API key",
      text: [
        "Here is a copy of the requester API key you were shown when you signed up.",
        "",
        apiKey,
        "",
        `principal_ref (put it in REST request bodies; MCP fills it in for you): ${principalRef}`,
        "",
        "We store only a hash of it, so we cannot show it again. Keep it somewhere safe.",
        `Starting balance: ${SIGNUP_KEY.trialBalance} USDC (Devnet test USDC, no real money).`,
        "",
        "Connect Claude Code:",
        add,
        "",
        `Other agents and the REST API: ${base}/developers`,
        "",
        "If you did not sign up, someone entered your address by mistake. You can ignore this email.",
      ].join("\n"),
    };
  }
  return {
    subject: "ProofMarket の API キー（控え）",
    text: [
      "お申し込みの画面に表示した、依頼者用の API キーの控えです。",
      "",
      apiKey,
      "",
      `principal_ref（REST で依頼を作るときに本文に入れる ID。MCP では自動で入ります）：${principalRef}`,
      "",
      "運営者の側にはキーそのものが残っていないので、もう一度は表示できません。なくさないように保管してください。",
      `最初の残高：${SIGNUP_KEY.trialBalance} USDC（Devnet の試験用 USDC で、本物のお金ではありません）`,
      "",
      "Claude Code につなぐ：",
      add,
      "",
      `ほかのエージェントや REST API でのつなぎ方：${base}/developers`,
      "",
      "心当たりがない場合は、どなたかが誤ってこのアドレスを入力したものです。このメールは無視してかまいません。",
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
