// Demo agent (REQ-X-D-101): ask whether a place is open, wait for a real witness, branch on the answer.
//   PROOFMARKET_API_KEY=pm_test_... pnpm --filter @proofmarket/scripts run run demo-agent.ts \
//     --base-url https://<app> --principal prn_... --lat 35.6595 --lng 139.7005 [--witnesses 1] [--deadline-min 45]
import { ProofMarketClient } from "@proofmarket/sdk";
import { args, need } from "./lib.ts";

const a = args();
const apiKey = process.env.PROOFMARKET_API_KEY ?? need(a, "key");
const client = new ProofMarketClient({ baseUrl: need(a, "base-url"), apiKey });
const witnesses = Number(a.witnesses ?? 1);
const deadline = new Date(Date.now() + Number(a["deadline-min"] ?? 45) * 60_000).toISOString();

const say = (m: string) => console.log(`[agent ${new Date().toISOString().slice(11, 19)}] ${m}`);

say("I need to know if the shop is open before booking. Web data may be stale, so I'll ask a human witness.");
const created = await client.createVerification(
  {
    type: "PLACE_STATUS_VERIFICATION",
    question: a.question ?? "Is this shop open right now?",
    answer_schema: { type: "enum", values: ["OPEN", "CLOSED", "UNCLEAR"] },
    location: { lat: Number(need(a, "lat")), lng: Number(need(a, "lng")), radius_m: Number(a.radius ?? 80) },
    deadline,
    freshness: { max_age_seconds: 300 },
    evidence_requirements: { photo: true, task_nonce: true },
    assurance: { required_witnesses: witnesses, quorum: witnesses },
    bounty: { asset: "USDC", amount: a.bounty ?? "0.50", network: "solana-devnet" },
    principal_ref: need(a, "principal"),
  },
  a.idem ?? `demo-${Date.now()}`,
);
say(`verification_id=${created.verification_id} status=${created.status}`);

const v = await client.waitForResult(created.verification_id, {
  timeoutMs: (Number(a["deadline-min"] ?? 45) + 2) * 60_000,
  intervalMs: 5000,
  onUpdate: (u) =>
    say(`status=${u.status} witnesses=${u.witness_progress.valid}/${u.witness_progress.required}`),
});

const r = v.result;
if (!r) {
  say(`No result yet (status=${v.status}). I will not assume an answer.`);
  process.exit(1);
}
console.log(JSON.stringify(r, null, 2));
if (r.status === "VERIFIED" && r.answer === "OPEN") say("Verified OPEN -> proceeding with the reservation.");
else if (r.status === "VERIFIED" && r.answer === "CLOSED")
  say("Verified CLOSED -> searching for another shop.");
else say(`Outcome ${r.status}${r.answer ? `/${r.answer}` : ""} -> asking a human operator to decide.`);
if (r.attestation) say(`On-chain receipt: ${r.attestation.explorer_url}`);
process.exit(0);
