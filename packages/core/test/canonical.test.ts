// 09-test-plan.md §3.1 — U-JCS-01, U-JCS-02.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type EvidenceBundle,
  evidenceRoot,
  fromSha256Hex,
  jcs,
  resultHash,
  taskIdHash,
  toSha256Hex,
} from "../src/evidence/bundle.ts";

const H = (c: string) => `sha256:${c.repeat(64)}` as const;
const bundle: EvidenceBundle = {
  schema: "proofmarket.evidence-bundle.v1",
  verification_id: "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  task_id_hash: H("a"),
  type: "PLACE_STATUS_VERIFICATION",
  question_hash: H("b"),
  answer_values: ["UNCLEAR", "OPEN", "CLOSED"],
  assurance: { required_witnesses: 2, quorum: 2 },
  submissions: [
    {
      witness_ref: "hmac:2",
      answer: "OPEN",
      evidence_sha256: [H("d")],
      server_received_at: "2026-10-09T03:14:40Z",
      checks: { geofence: "pass", freshness: "pass" },
    },
    {
      witness_ref: "hmac:1",
      answer: "OPEN",
      evidence_sha256: [H("c")],
      server_received_at: "2026-10-09T03:14:29Z",
      checks: { freshness: "pass", geofence: "pass" },
    },
  ],
  outcome: "VERIFIED",
  final_answer: "OPEN",
  finalized_at: "2026-10-09T03:14:41Z",
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("canonicalization", () => {
  it("U-JCS-01: golden bundle -> golden evidence_root; key and submission order do not matter", () => {
    // Hand-written canonical form: keys sorted, answer_values sorted, submissions by server_received_at.
    const expected =
      '{"answer_values":["CLOSED","OPEN","UNCLEAR"],"assurance":{"quorum":2,"required_witnesses":2},' +
      '"final_answer":"OPEN","finalized_at":"2026-10-09T03:14:41Z","outcome":"VERIFIED",' +
      `"question_hash":"${H("b")}","schema":"proofmarket.evidence-bundle.v1",` +
      `"submissions":[{"answer":"OPEN","checks":{"freshness":"pass","geofence":"pass"},"evidence_sha256":["${H("c")}"],"server_received_at":"2026-10-09T03:14:29Z","witness_ref":"hmac:1"},` +
      `{"answer":"OPEN","checks":{"freshness":"pass","geofence":"pass"},"evidence_sha256":["${H("d")}"],"server_received_at":"2026-10-09T03:14:40Z","witness_ref":"hmac:2"}],` +
      `"task_id_hash":"${H("a")}","type":"PLACE_STATUS_VERIFICATION","verification_id":"ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1"}`;
    const root = toSha256Hex(evidenceRoot(bundle));
    expect(root).toBe(`sha256:${sha(expected)}`);
    const shuffled = {
      ...bundle,
      submissions: [...bundle.submissions].reverse(),
      answer_values: ["OPEN", "CLOSED", "UNCLEAR"],
    } as EvidenceBundle;
    expect(toSha256Hex(evidenceRoot(shuffled))).toBe(root);
    // Pinned regression value: changing canonicalization breaks on-chain verification.
    expect(root).toMatchInlineSnapshot(
      `"sha256:f612d7b42627e3e8d06d389a263505925537955df4cd9a3188ffc5dca906c565"`,
    );
  });

  it("U-JCS-02: result_hash input excludes result_hash, consensus_ratio, attestation, settlement, verified_at", () => {
    const core = { verification_id: "ver_x", status: "VERIFIED", answer: "OPEN", answer_counts: { OPEN: 2 } };
    const full = {
      ...core,
      result_hash: "sha256:...",
      consensus_ratio: 0.9999999,
      attestation: { signature: "x" },
      settlement: { status: "PENDING" },
      verified_at: "2026-10-09T03:14:41Z",
    };
    expect(resultHash(full)).toEqual(resultHash(core));
    expect(Buffer.from(resultHash(core)).toString("hex")).toBe(sha(jcs(core)));
  });

  it("taskIdHash = sha256('proofmarket:task:v1:' + id); hex round-trips", () => {
    const h = taskIdHash("ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1");
    expect(Buffer.from(h).toString("hex")).toBe(sha("proofmarket:task:v1:ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1"));
    expect(fromSha256Hex(toSha256Hex(h))).toEqual(h);
  });
});
