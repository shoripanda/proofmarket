import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { handleCreate } from "../../lib/handlers/requester";
import {
  handleChallenge,
  handleClaim,
  handleEvidence,
  handleListTasks,
  handleOnboarding,
  handleUpload,
} from "../../lib/handlers/worker";
import { LEGAL_VERSIONS } from "../../lib/legal";
import { applyTaskEvent, lockTask } from "../../lib/services/task-engine";
import { issueInvite } from "../../lib/services/worker-service";
import { call, createBody, type createTestApp, jsonReq, SHOP } from "./app";

type T = Awaited<ReturnType<typeof createTestApp>>;

/** A unique, decodable JPEG (random noise => unique sha256 and dHash). */
export async function photo(w = 1280, h = 720): Promise<Buffer> {
  return sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function onboardWorker(t: T, userId: string) {
  t.identity.addresses.set(userId, `Wallet${userId}11111111111111111111111111`.slice(0, 44));
  const code = await issueInvite(t.db, { uses: 1, expiresAt: new Date(t.app.now().getTime() + 86_400_000) });
  const res = await call(
    (r) => handleOnboarding(t.app, r),
    jsonReq("POST", "/v1/worker/onboarding", {
      key: `tok:${userId}`,
      body: {
        invite_code: code,
        consents: {
          worker_terms: LEGAL_VERSIONS.worker_terms,
          safety_rules: LEGAL_VERSIONS.safety_rules,
          privacy_notice: LEGAL_VERSIONS.privacy_notice,
        },
      },
    }),
  );
  return { token: `tok:${userId}`, res };
}

/** Create a task and move it to OPEN through the engine (FUND_TASK is PR-11). */
export async function openTask(t: T, o: Record<string, unknown> = {}): Promise<string> {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
  const { verification_id: id } = (await res.json()) as { verification_id: string };
  await openCreated(t, id);
  return id;
}

/** Move a CREATED task to OPEN as the FUND_TASK job would (PR-11). */
export async function openCreated(t: T, id: string): Promise<void> {
  await t.db.transaction(async (tx) => {
    const task = await lockTask(tx, id);
    await applyTaskEvent(tx, t.app, task, "FUNDING_CONFIRMED", {
      actorType: "system",
      actorRef: null,
      correlationId: id,
      chain: { fundingFinalized: true },
    });
    await applyTaskEvent(tx, t.app, task, "OPEN", { actorType: "system", actorRef: null, correlationId: id });
  });
}

export const W = (t: T, token: string) => ({
  list: (q = `lat=${SHOP.lat.toFixed(3)}&lng=${SHOP.lng.toFixed(3)}`) =>
    call((r) => handleListTasks(t.app, r), jsonReq("GET", `/v1/worker/tasks?${q}`, { key: token })),
  claim: (id: string) =>
    call((r) => handleClaim(t.app, r, id), jsonReq("POST", `/v1/worker/tasks/${id}/claim`, { key: token })),
  challenge: (claimId: string) =>
    call(
      (r) => handleChallenge(t.app, r, claimId),
      jsonReq("POST", `/v1/worker/claims/${claimId}/challenge`, { key: token }),
    ),
  upload: (claimId: string, challengeId: string, o: Record<string, unknown> = {}) =>
    call(
      (r) => handleUpload(t.app, r, claimId),
      jsonReq("POST", `/v1/worker/claims/${claimId}/uploads`, {
        key: token,
        body: { challenge_id: challengeId, content_type: "image/jpeg", byte_size: 500_000, ...o },
      }),
    ),
  evidence: (id: string, body: unknown, idem = crypto.randomUUID()) =>
    call(
      (r) => handleEvidence(t.app, r, id),
      jsonReq("POST", `/v1/worker/tasks/${id}/evidence`, { key: token, body, idem }),
    ),
});

/**
 * Full happy path for one witness: claim -> challenge -> upload bytes -> submit. Returns the submit response JSON.
 * `photos` sends several photos, each its own upload under the same challenge (01 §4.18).
 */
export async function witness(
  t: T,
  token: string,
  id: string,
  o: {
    answer?: string;
    bytes?: Buffer;
    photos?: Buffer[];
    at?: { lat: number; lng: number };
    accuracy?: number;
    claimId?: string;
  } = {},
) {
  const w = W(t, token);
  let claimId = o.claimId;
  if (!claimId) {
    const c = (await (await w.claim(id)).json()) as { claim_id: string };
    claimId = c.claim_id;
  }
  const ch = (await (await w.challenge(claimId)).json()) as { challenge_id: string; nonce: string };
  const refs: string[] = [];
  for (const bytes of o.photos ?? [o.bytes ?? (await photo())]) {
    const up = (await (await w.upload(claimId, ch.challenge_id)).json()) as {
      upload_id: string;
      upload_url: string;
    };
    t.storage.upload(up.upload_url.replace("https://storage.test/upload/", ""), bytes);
    refs.push(up.upload_id);
  }
  const at = o.at ?? SHOP;
  const res = await w.evidence(id, {
    claim_id: claimId,
    answer: o.answer ?? "OPEN",
    capture: {
      client_timestamp: t.app.now().toISOString(),
      lat: at.lat,
      lng: at.lng,
      accuracy_m: o.accuracy ?? 12,
    },
    challenge: { nonce: ch.nonce },
    evidence: refs.map((object_ref) => ({ type: "photo", object_ref })),
  });
  return { res, claimId, body: (await res.clone().json()) as Record<string, unknown> };
}
