import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function sha256(data: Uint8Array | string): Buffer {
  return createHash("sha256").update(data).digest();
}

/** 32 random bytes, base64url (nonce, API key secret, invite code material). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string compare for shared secrets (admin token, cron secret). */
export function safeEqual(a: string, b: string): boolean {
  const ha = sha256(a);
  const hb = sha256(b);
  return timingSafeEqual(ha, hb);
}

/** AES-256-GCM. Layout: iv(12) | tag(16) | ciphertext. */
export function encryptBytes(key: Buffer, data: Buffer): Buffer {
  if (key.length !== 32) throw new Error("encryption key must be 32 bytes");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decryptBytes(key: Buffer, blob: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

/** AES-256-GCM(lat,lng) with LOCATION_ENC_KEY (04 §3.11). Layout: iv(12) | tag(16) | ciphertext. */
export function encryptLocation(key: Buffer, lat: number, lng: number): Buffer {
  if (key.length !== 32) throw new Error("LOCATION_ENC_KEY must be 32 bytes");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify([lat, lng]), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decryptLocation(key: Buffer, blob: Buffer): { lat: number; lng: number } {
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  const [lat, lng] = JSON.parse(Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8")) as [
    number,
    number,
  ];
  return { lat, lng };
}

/** HMAC-SHA256(WORKER_REF_SALT, worker_id + ":" + verification_id) — per-task witness_ref (07 §5.1). */
export function witnessRef(salt: string, workerId: string, verificationId: string): `hmac:${string}` {
  return `hmac:${createHmac("sha256", salt).update(`${workerId}:${verificationId}`).digest("hex")}`;
}
