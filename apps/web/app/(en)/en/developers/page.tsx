// EN-02 Developers — the shortest path from "I have an agent" to "a person in Tokyo answered".
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Code, PageHero, Section } from "@/components/site";

export const metadata: Metadata = {
  title: "Developers | ProofMarket",
  description:
    "Connect Claude, ChatGPT or your own agent over MCP, REST or x402, and get verified real-world answers.",
};

async function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "<your-app>"}`;
}

const TOOLS: [string, string][] = [
  ["request_reality_verification", "Ask. Returns a verification_id at once; the result comes later."],
  ["get_reality_verification", "Read state and result. wait_seconds (≤ 20) waits for a change."],
  ["cancel_reality_verification", "Cancel while nobody has started. The bounty returns to the balance."],
  [
    "dispute_reality_verification",
    "Doubt a result? One recheck within 24 h, by default two agreeing witnesses.",
  ],
  ["watch_reality_verification", "Keep checking at an interval until a verified answer matches stop_when."],
  [
    "list_reality_verification_watches",
    "Watches and recurring checks, with why they stopped and what matched.",
  ],
  ["stop_reality_verification_watch", "Stop one. Runs already created keep going."],
];

const TYPES: [string, string][] = [
  [
    "At a place, choice answer",
    "PLACE_STATUS_VERIFICATION · QUEUE_LENGTH · NOTICE_POSTED · CROWD_LEVEL · SEAT_AVAILABILITY · PARKING_AVAILABILITY · STOCK_CHECK",
  ],
  ["At a place, number / text", "PRICE_CHECK · SIGN_TRANSCRIPTION · SITE_REPORT"],
  [
    "Anywhere (work from home)",
    "DOCUMENT_TRANSCRIPTION · DOCUMENT_QA · PRODUCT_INSPECTION · PHONE_INQUIRY · MEASUREMENT · CUSTOM_CHOICE · CUSTOM_TASK",
  ],
];

export default async function EnDevelopers() {
  const base = await baseUrl();
  return (
    <>
      <PageHero eyebrow="Developers" title="Three ways in. Same people, same checks, same Solana settlement.">
        <p>
          Use the remote MCP server from Claude or ChatGPT, call the REST API, or pay per request with x402
          and no account at all. During the pilot, API keys (<code className="font-mono">pm_test_…</code>) are
          issued by the operator; x402 needs none.
        </p>
      </PageHero>

      <Section title="1. MCP — Claude Code, claude.ai, ChatGPT, Cursor">
        <div className="space-y-4">
          <div>
            <h3 className="font-bold">Claude Code (API key in a header)</h3>
            <div className="mt-2">
              <Code>{`claude mcp add --transport http proofmarket ${base}/mcp \\
  --header "Authorization: Bearer pm_test_..."`}</Code>
            </div>
          </div>
          <div>
            <h3 className="font-bold">claude.ai / ChatGPT connectors (OAuth 2.1)</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Add a custom connector with the URL below. The consent page is ours: paste the API key there
              once. The server advertises dynamic client registration and PKCE at{" "}
              <code className="font-mono">/.well-known/oauth-authorization-server</code>. In ChatGPT, turn on
              Developer mode first (Settings → Apps → Advanced).
            </p>
            <div className="mt-2">
              <Code>{`${base}/mcp`}</Code>
            </div>
          </div>
          <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {TOOLS.map(([name, desc]) => (
              <div key={name} className="grid gap-1 p-4 sm:grid-cols-[20rem_1fr]">
                <dt className="break-all font-mono text-sm font-semibold">{name}</dt>
                <dd className="text-sm text-slate-600">{desc}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm leading-relaxed text-slate-600">
            A person has to do the work, so results usually take 10–60 minutes. The tool descriptions tell the
            model never to invent an outcome before the status is VERIFIED, REJECTED or EXPIRED.
          </p>
        </div>
      </Section>

      <Section
        title="2. x402 — pay per request, no sign-up"
        lead="Any agent with a Solana wallet and Devnet USDC. The operator co-signs as fee payer, so the agent needs no SOL."
      >
        <Code>{`# 1st call: 402 with the payment terms in PAYMENT-REQUIRED
curl -i -X POST ${base}/v1/x402/verifications \\
  -H "Content-Type: application/json" -d @request.json

# 2nd call: same body, plus the signed USDC transfer
curl -X POST ${base}/v1/x402/verifications \\
  -H "Content-Type: application/json" -d @request.json \\
  -H "PAYMENT-SIGNATURE: <base64 PaymentPayload>"

# or run the sample agent end to end (any of the 17 types)
pnpm --filter @proofmarket/scripts run run x402-agent.ts --base-url ${base} \\
  --type DOCUMENT_TRANSCRIPTION --question "Copy the total line of the paper invoice in front of you"`}</Code>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          The 201 response carries the verification_id, a scoped API key for reading that result, and the
          Explorer URL of the payment. The same transaction can never create two requests. Cap per request: 5
          USDC.
        </p>
      </Section>

      <Section title="3. REST">
        <Code>{`curl -X POST ${base}/v1/verifications \\
  -H "Authorization: Bearer $PROOFMARKET_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "SIGN_TRANSCRIPTION",
    "question": "Transcribe the opening-hours notice at the entrance exactly as written.",
    "answer_schema": { "type": "text", "max_chars": 500 },
    "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
    "deadline": "2026-10-12T09:00:00Z",
    "freshness": { "max_age_seconds": 300 },
    "evidence_requirements": { "photo": true, "task_nonce": true },
    "assurance": { "level": "standard" },
    "bounty": { "asset": "USDC", "amount": "0.30", "network": "solana-devnet" },
    "principal_ref": "prn_..."
  }'

curl ${base}/v1/verifications/ver_... -H "Authorization: Bearer $PROOFMARKET_API_KEY"`}</Code>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          OpenAPI: <code className="font-mono">packages/core/openapi.json</code> in the repository. Webhooks
          for every state change, result reuse (<code className="font-mono">allow_reuse</code> /{" "}
          <code className="font-mono">reuse</code>), disputes, schedules and watches are all on the same key.
        </p>
      </Section>

      <Section title="What you can ask for">
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {TYPES.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[16rem_1fr]">
              <dt className="text-sm font-semibold">{k}</dt>
              <dd className="font-mono text-xs leading-relaxed text-slate-600">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Answers are a fixed choice, a number (with unit and range) or free text (requester-only; never
          public).
          <code className="mx-1 font-mono">assurance</code> picks fast (1 witness), standard (2 agreeing) or
          high (2 of 3).
        </p>
      </Section>

      <Section title="What comes back, and what you can show your user">
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>result.checks</b> — geofence, freshness, task nonce, replay, duplicate, media and{" "}
              <b>vision_consistency</b> (the AI review). All of them are inside result_hash.
            </li>
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>result.reviews</b> — per accepted submission: verdict, reason and what the photo showed.
              Requester-only.
            </li>
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>result.attestation</b> — the Solana signature, task account and Explorer URL.
            </li>
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>result.proof</b> — a public page, a badge image and ready-made Markdown. Hand it to the
              person you are answering: it shows a human checked this, when, by how many people, with the
              on-chain record.
            </li>
          </ul>
          <Code>{`"proof": {
  "url": "${base}/r/ver_01J9Z4K8...",
  "badge_url": "${base}/r/ver_01J9Z4K8.../badge.svg",
  "markdown": "[![人が確認](…/badge.svg)](…/r/ver_01J9Z4K8...)"
}`}</Code>
        </div>
        <p className="mt-6 text-sm text-slate-600">
          Add <code className="font-mono">"publish": true</code> to put a verified fact about a public place
          on the{" "}
          <Link href="/map" className="font-semibold text-teal-700 underline">
            public map
          </Link>{" "}
          for 72 hours. Full Japanese reference with every field:{" "}
          <Link href="/developers" className="font-semibold text-teal-700 underline">
            /developers
          </Link>
          .
        </p>
      </Section>

      <Section title="Get a key">
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          During the pilot the operator issues API keys by hand.{" "}
          <Link href="/join?role=requester" className="font-semibold text-teal-700 underline">
            Request one here
          </Link>{" "}
          (the form is in Japanese: role, e-mail, a note). Or skip the key entirely and use x402 with Devnet
          USDC from the Circle faucet.
        </p>
      </Section>
    </>
  );
}
