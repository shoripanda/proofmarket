// Sample agent that pays per request with x402 (01 §4.19): no API key, no sign-up, no SOL needed.
// It POSTs a request, gets HTTP 402 with the payment terms, builds the USDC transfer the exact SVM scheme
// expects, signs it as the token owner (the server co-signs as fee payer), resends, and waits for the result.
//
//   pnpm --filter @proofmarket/scripts run run x402-agent.ts --base-url https://<app> \
//     [--type OTHER] [--question "..."] [--lat 35.6595 --lng 139.7005] [--bounty 0.10] [--deadline-min 45]
//
// Wallet: ~/.config/proofmarket/x402-agent.json (created on first run, mode 0600). It needs Devnet USDC
// (mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU) in its token account: get some from
// https://faucet.circle.com (Solana Devnet), or have the operator run x402-fund-agent.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildExactSvmPayment, encodeHeader, type PaymentRequirements } from "@proofmarket/solana";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { args, need } from "./lib.ts";

const a = args();
const base = need(a, "base-url").replace(/\/$/, "");
const rpc = a.rpc ?? "https://api.devnet.solana.com";
const say = (m: string) => console.log(`[x402-agent ${new Date().toISOString().slice(11, 19)}] ${m}`);

function loadAgentWallet(): Keypair {
  const dir = join(homedir(), ".config", "proofmarket");
  const path = join(dir, "x402-agent.json");
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
}

const wallet = loadAgentWallet();
say(`wallet ${wallet.publicKey.toBase58()}`);

const deadlineMin = Number(a["deadline-min"] ?? 45);
const type = a.type ?? "PLACE_STATUS_VERIFICATION";
const location =
  a.lat && a.lng ? { lat: Number(a.lat), lng: Number(a.lng), radius_m: Number(a.radius ?? 80) } : undefined;
const answer_schema =
  type === "PLACE_STATUS_VERIFICATION"
    ? { type: "enum", values: ["OPEN", "CLOSED", "UNCLEAR"] }
    : { type: "text" };
const body = {
  type,
  question: a.question ?? "Is this shop open right now?",
  answer_schema,
  ...(location ? { location } : {}),
  deadline: new Date(Date.now() + deadlineMin * 60_000).toISOString(),
  freshness: { max_age_seconds: 300 },
  evidence_requirements: { photo: true, task_nonce: true },
  assurance: { required_witnesses: 1, quorum: 1 },
  bounty: { asset: "USDC", amount: a.bounty ?? "0.10", network: "solana-devnet" },
};
const url = `${base}/v1/x402/verifications`;
const post = (headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

// 1. Ask without paying: the server answers 402 with what it accepts.
const first = await post();
if (first.status !== 402) {
  say(`expected 402, got ${first.status}: ${await first.text()}`);
  process.exit(1);
}
const required = JSON.parse(
  Buffer.from(first.headers.get("payment-required") ?? "", "base64").toString("utf8"),
) as {
  accepts: PaymentRequirements[];
};
const req = required.accepts.find((r) => r.scheme === "exact" && r.network.startsWith("solana:"));
if (!req) throw new Error("no Solana exact payment option offered");
say(
  `402: pay ${Number(req.amount) / 1e6} USDC to ${req.payTo} on ${req.network} (fee paid by ${req.extra.feePayer})`,
);

// 2. Check the balance, build and sign the transfer. The fee payer's signature slot stays empty.
const connection = new Connection(rpc, "confirmed");
const ata = getAssociatedTokenAddressSync(new PublicKey(req.asset), wallet.publicKey);
const balance = await getAccount(connection, ata)
  .then((x) => x.amount)
  .catch(() => 0n);
if (balance < BigInt(req.amount)) {
  say(`not enough USDC in ${ata.toBase58()} (have ${Number(balance) / 1e6}). See the header of this script.`);
  process.exit(1);
}
const { blockhash } = await connection.getLatestBlockhash("confirmed");
const transaction = buildExactSvmPayment({
  requirements: req,
  owner: wallet,
  recentBlockhash: blockhash,
  decimals: 6,
});
const header = encodeHeader({ x402Version: 2, resource: { url }, accepted: req, payload: { transaction } });

// 3. Resend with the payment. The server settles on Solana, then creates the verification.
const paid = await post({ "PAYMENT-SIGNATURE": header });
const out = (await paid.json()) as {
  verification_id?: string;
  api_key?: string;
  payment?: { signature: string; explorer_url: string };
  error?: unknown;
};
if (paid.status !== 201 || !out.verification_id || !out.api_key) {
  say(`payment not accepted (${paid.status}): ${JSON.stringify(out)}`);
  const r = paid.headers.get("payment-response");
  if (r) say(`PAYMENT-RESPONSE ${Buffer.from(r, "base64").toString("utf8")}`);
  process.exit(1);
}
say(`paid: ${out.payment?.explorer_url}`);
say(`verification_id=${out.verification_id} (api key ${out.api_key.slice(0, 17)}… for reading the result)`);

// 4. Wait for a person to answer, with the key the payment came with.
const until = Date.now() + (deadlineMin + 2) * 60_000;
while (Date.now() < until) {
  const r = await fetch(`${base}/v1/verifications/${out.verification_id}`, {
    headers: { authorization: `Bearer ${out.api_key}` },
  });
  const v = (await r.json()) as { status: string; result?: { status: string; answer: unknown } | null };
  say(`status=${v.status}`);
  if (v.result) {
    say(`result: ${v.result.status} answer=${JSON.stringify(v.result.answer)}`);
    process.exit(0);
  }
  await new Promise((res) => setTimeout(res, 10_000));
}
say("no result before the deadline");
