// Compare a public result with the Task account on Solana, from the visitor's own browser (S-07).
// Layout follows programs/proofmarket/src/state.rs (Anchor: 8-byte discriminator, borsh, 1-byte enums).
import bs58 from "bs58";
import { type Lang, pick } from "@/lib/lang";

const OFF = {
  taskIdHash: 11,
  status: 157,
  outcome: 158,
  evidenceRoot: 160,
  resultHash: 192,
  end: 224,
} as const;
const STATUS = ["Funded", "Finalized", "Settled", "Refunded"] as const;
const OUTCOME = ["None", "Verified", "NoConsensus", "InsufficientWitnesses"] as const;
const DOMAIN = "proofmarket:task:v1:";

export interface OnchainTask {
  taskIdHash: string;
  status: string;
  outcome: string;
  evidenceRoot: string;
  resultHash: string;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function decodeTask(data: Uint8Array): OnchainTask {
  if (data.length < OFF.end) throw new Error("account too small for a Task");
  return {
    taskIdHash: hex(data.subarray(OFF.taskIdHash, OFF.taskIdHash + 32)),
    status: STATUS[data[OFF.status] ?? 255] ?? "Unknown",
    outcome: OUTCOME[data[OFF.outcome] ?? 255] ?? "Unknown",
    evidenceRoot: hex(data.subarray(OFF.evidenceRoot, OFF.evidenceRoot + 32)),
    resultHash: hex(data.subarray(OFF.resultHash, OFF.resultHash + 32)),
  };
}

export async function taskIdHashHex(verificationId: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(DOMAIN + verificationId));
  return hex(new Uint8Array(d));
}

const EXPECTED_OUTCOME: Record<string, string> = {
  VERIFIED: "Verified",
  REJECTED: "NoConsensus",
  EXPIRED: "InsufficientWitnesses",
};

export interface CheckItem {
  label: string;
  ok: boolean;
  detail: string;
}

/** Pure comparison so it can be unit-tested without a network. */
export async function compare(
  shown: { verificationId: string; status: string; evidenceRoot: string; resultHash: string },
  account: { owner: string; data: Uint8Array },
  programId: string,
  lang: Lang = "ja",
): Promise<CheckItem[]> {
  const t = decodeTask(account.data);
  const strip = (s: string) => s.replace(/^sha256:/, "");
  const idHash = await taskIdHashHex(shown.verificationId);
  return [
    {
      label: pick(lang, "ProofMarket のプログラムが持つ口座", "Account owned by the ProofMarket program"),
      ok: account.owner === programId,
      detail: account.owner,
    },
    {
      label: pick(lang, "この結果の ID から計算した値と一致", "Matches the hash of this result's ID"),
      ok: t.taskIdHash === idHash,
      detail: t.taskIdHash,
    },
    {
      label: pick(lang, "結果の種類が一致", "Outcome matches"),
      ok: EXPECTED_OUTCOME[shown.status] === t.outcome,
      detail: `${t.outcome} (${t.status})`,
    },
    {
      label: pick(lang, "evidence_root が一致", "evidence_root matches"),
      ok: t.evidenceRoot === strip(shown.evidenceRoot),
      detail: t.evidenceRoot,
    },
    {
      label: pick(lang, "result_hash が一致", "result_hash matches"),
      ok: t.resultHash === strip(shown.resultHash),
      detail: t.resultHash,
    },
  ];
}

export async function fetchAccount(rpcUrl: string, address: string) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [address, { encoding: "base64", commitment: "confirmed" }],
    }),
  });
  const j = (await res.json()) as { result?: { value: { owner: string; data: [string, string] } | null } };
  const v = j.result?.value;
  if (!v) throw new Error("account not found");
  return { owner: v.owner, data: Uint8Array.from(atob(v.data[0]), (c) => c.charCodeAt(0)) };
}

export const isBase58Address = (s: string) => {
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
};
