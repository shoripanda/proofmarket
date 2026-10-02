import "server-only";

/** AES-256-GCM with LOCATION_ENC_KEY (04 §3.11). PR-06. */
export function encryptLocation(_lat: number, _lng: number): Buffer {
  throw new Error("NOT_IMPLEMENTED: encryptLocation (PR-06)");
}

/** HMAC-SHA256(WORKER_REF_SALT, worker_id + ":" + verification_id) — per-task witness_ref (07 §5.1). PR-08. */
export function witnessRef(_workerId: string, _verificationId: string): `hmac:${string}` {
  throw new Error("NOT_IMPLEMENTED: witnessRef (PR-08)");
}

/** 32 random bytes, base64url (nonce, API key secret). PR-04/05. */
export function randomToken(): string {
  throw new Error("NOT_IMPLEMENTED: randomToken (PR-04)");
}

export function sha256(_data: Uint8Array | string): Buffer {
  throw new Error("NOT_IMPLEMENTED: sha256 (PR-02)");
}
