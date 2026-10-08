import "server-only";
// Local development stack (APP_ENV=local + DEV_MODE=1 only): fake login, local-file storage, in-memory chain.
// Lets the worker UI run end to end without Privy, Supabase or Solana. Refused in any other environment.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LIMITS } from "@proofmarket/core";
import type {
  ChainResult,
  FinalizeAndSettleInput,
  FundTaskInput,
  OnChainTask,
  RefundInput,
  SettlementAdapter,
} from "@proofmarket/solana";
import type { EvidenceStorage, IdentityProvider } from "../ports";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (buf: Buffer) => {
  let n = BigInt(`0x${buf.toString("hex")}`);
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  return s;
};

export function assertDevAllowed(appEnv: string) {
  if (appEnv !== "local") throw new Error("DEV_MODE is only allowed with APP_ENV=local");
}

// x402 in DEV_MODE (01 §4.19): requirements name Devnet USDC, but the offline facilitator never sends anything.
export const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
/** Public on purpose: it only co-signs payments that are never sent. */
export const devX402Seed = () => createHash("sha256").update("proofmarket-dev-x402-fee-payer").digest();

/** Token format: `dev:<name>`. Payout address is a deterministic fake base58 key. */
export const devIdentity: IdentityProvider = {
  async verifyAccessToken(token) {
    const m = /^dev:([a-z0-9_-]{1,32})$/i.exec(token);
    if (!m?.[1]) throw new Error("invalid dev token");
    return { userId: `dev-${m[1]}` };
  },
  async payoutAddress(userId) {
    return b58(createHash("sha256").update(userId).digest()).slice(0, 44);
  },
};

/** Stores objects under .data/storage; uploads go to /api/dev/upload/<key> (see app/api/dev). */
export function localStorage(root: string, publicBaseUrl: string): EvidenceStorage {
  const path = (bucket: string, key: string) => join(root, bucket, key);
  return {
    async createSignedUploadUrl(key) {
      return { url: `${publicBaseUrl}/api/dev/upload/${key}`, expiresInS: LIMITS.uploadUrlTtlS };
    },
    async read(key) {
      try {
        const p = path("evidence-raw", key);
        return { bytes: readFileSync(p), createdAt: statSync(p).mtime };
      } catch {
        return null;
      }
    },
    async putDerived(key, bytes) {
      const p = path("evidence-derived", key);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, bytes);
    },
    async createSignedDownloadUrl(_b, key) {
      return `${publicBaseUrl}/api/dev/file/evidence-derived/${key}`;
    },
    async remove(bucket, keys) {
      for (const k of keys) rmSync(path(bucket, k), { force: true });
    },
  };
}

export function writeDevUpload(root: string, key: string, bytes: Buffer) {
  if (key.includes("..")) throw new Error("bad key");
  const p = join(root, "evidence-raw", key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, bytes);
}

/** In-memory program stand-in with the same idempotency semantics as the real adapter. */
export function devChain(): SettlementAdapter {
  const tasks = new Map<string, OnChainTask>();
  let n = 0;
  const k = (h: Uint8Array) => Buffer.from(h).toString("hex");
  const sig = () =>
    b58(createHash("sha256").update(`devsig${++n}${Date.now()}`).digest())
      .padEnd(64, "1")
      .slice(0, 88);
  const ok = (signature: string | null, taskAccount: string, alreadyDone = false): ChainResult => ({
    kind: "confirmed",
    signature,
    alreadyDone,
    taskAccount,
  });
  return {
    async assertSafeToStart() {},
    async readTask(h) {
      return tasks.get(k(h)) ?? null;
    },
    async balances() {
      return { operatorLamports: 10n ** 10n, treasuryAmount: 10n ** 9n };
    },
    async fundTask(i: FundTaskInput, onSigned) {
      const key = k(i.taskIdHash);
      const addr = `DevTask${key.slice(0, 36)}`;
      if (tasks.has(key)) return ok(null, addr, true);
      const s = sig();
      await onSigned(s);
      tasks.set(key, {
        address: addr,
        status: "Funded",
        outcome: "None",
        amountPerWitness: i.amountPerWitness,
        requiredWitnesses: i.requiredWitnesses,
        quorum: i.quorum,
        deadline: Math.floor(i.deadline.getTime() / 1000),
        evidenceRoot: new Uint8Array(32),
        resultHash: new Uint8Array(32),
        recipients: [],
        paidTotal: 0n,
      });
      return ok(s, addr);
    },
    async finalizeAndSettle(i: FinalizeAndSettleInput, onSigned) {
      const t = tasks.get(k(i.taskIdHash));
      if (!t) return { kind: "halt", error: "task missing" };
      if (t.status === "Settled") return ok(null, t.address, true);
      if (t.status === "Refunded") return { kind: "halt", error: "already refunded" };
      if (i.amountPerWitness !== undefined && i.amountPerWitness > t.amountPerWitness)
        return { kind: "halt", error: "AmountIncrease" };
      const s = sig();
      await onSigned(s);
      if (i.amountPerWitness !== undefined) t.amountPerWitness = i.amountPerWitness;
      Object.assign(t, {
        status: "Settled",
        recipients: i.recipients,
        paidTotal: t.amountPerWitness * BigInt(i.recipients.length),
      });
      return ok(s, t.address);
    },
    async refund(i: RefundInput, onSigned) {
      const t = tasks.get(k(i.taskIdHash));
      if (!t) return { kind: "halt", error: "task missing" };
      if (t.status === "Refunded") return ok(null, t.address, true);
      if (t.status !== "Funded") return { kind: "halt", error: `cannot refund ${t.status}` };
      const s = sig();
      await onSigned(s);
      t.status = "Refunded";
      return ok(s, t.address);
    },
  };
}
