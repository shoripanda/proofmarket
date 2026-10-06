// EN-01 Home — the pitch in one page: what is real today, how it works, why Solana, where to try it.
import { LIMITS, TASK_TYPES } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { BigNumber, duration, loadStats } from "@/components/stats";
import { env, isDev } from "@/lib/env";

export const metadata: Metadata = {
  title: "ProofMarket — real-world verification for AI agents, settled on Solana",
  description:
    "An AI agent asks; a person checks it on the spot; AI reviews the evidence; the result and the payout are recorded on Solana. Pay per request with x402.",
};

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    title: "Humans do what agents cannot",
    body: `Is this shop open right now? What does the sign say? Is the item on the shelf? Call the clinic and ask. Measure it. ${TASK_TYPES.length} task types, on site or from home.`,
  },
  {
    title: "Every submission is reviewed by AI",
    body: "Before an answer counts, Claude compares the photo and the answer with the request. A summary where a transcription was asked for is sent back; the worker retries. The verdict ships with the result.",
  },
  {
    title: "Quorum, not one person's word",
    body: "The requester chooses how many witnesses must agree. Photos are checked for place, time, replay and near-duplicates. Nothing is final until the quorum is met.",
  },
  {
    title: "Solana makes it checkable by anyone",
    body: "The bounty sits in an on-chain escrow from the moment of the request. The result hash and the payout are written in the same transaction. Verify it yourself from the browser.",
  },
];

const STEPS = [
  [
    "Ask",
    "The agent calls one MCP tool (or POSTs to the REST API, or pays with x402). It names the place, the deadline, how many witnesses must agree and the bounty.",
  ],
  [
    "A person does it",
    "A worker in Tokyo takes the task on their phone, goes there (or works from home for document, phone and measurement tasks), takes photos and answers.",
  ],
  [
    "Checks and AI review",
    "Place, time, task nonce, replay and duplicate checks run first; then Claude reviews the evidence against the request. Then consensus.",
  ],
  [
    "Result and settlement",
    "The agent gets structured JSON with the verdict, the checks and a public proof link. The worker is paid in USDC on Solana in the same step.",
  ],
];

export default async function EnHome() {
  const s = await loadStats();
  const e = env();
  const programId = isDev(e) ? null : e.PROGRAM_ID;
  return (
    <>
      <PageHero
        eyebrow="ProofMarket · pilot running in Tokyo"
        title="Give your AI agent hands in the real world — and proof it can show."
      >
        <p>
          Agents can read the web, but they cannot walk to a shop, read a paper notice, pick up a phone or
          hold a ruler. ProofMarket lets an agent hire a real person for exactly that, has AI review the
          evidence, and settles the result and the payout on Solana so anyone can check it later.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/try"
            className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Play the 3-minute demo
          </Link>
          <Link
            href="/en/developers"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-700 hover:bg-teal-50"
          >
            Connect Claude, ChatGPT or your own agent
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The demo page is bilingual in spirit but its labels are Japanese; every step is explained below.
        </p>
      </PageHero>

      <Section
        title="What is live today"
        lead="Everything on this page is deployed and running against Solana Devnet. Numbers come from the database and refresh every minute."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BigNumber
            value={s ? String(s.verifications.completed) : "—"}
            label="requests completed by people"
          />
          <BigNumber
            value={s ? `${s.paid_to_workers.amount} USDC` : "—"}
            label="paid to workers"
            note="Solana Devnet"
          />
          <BigNumber value={s ? duration(s.median_seconds_to_result) : "—"} label="median time to a result" />
          <BigNumber value={String(TASK_TYPES.length)} label="task types" note="on site and from home" />
        </div>
        <ul className="mt-6 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Remote MCP server with OAuth 2.1 — works from Claude Code, claude.ai and ChatGPT connectors",
            "7 MCP tools: request, read, cancel, dispute, watch until a condition holds, list and stop watches",
            "x402: any agent with a Solana wallet pays USDC per request — no sign-up, no API key, no SOL",
            "AI review of every submission (Claude), with the verdict and reasons returned to the requester",
            "Public proof page and badge per result; public map of facts requesters chose to share",
            "Worker app: camera-only capture, geofence, task nonce, push notifications, work-from-home tasks",
          ].map((t) => (
            <li key={t} className="rounded-2xl bg-slate-50 p-4">
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/stats" className="font-semibold text-teal-700 underline">
            Full numbers →
          </Link>
        </p>
      </Section>

      <Section title="Why an agent can trust what comes back">
        <ul className="grid gap-4 lg:grid-cols-2">
          {PILLARS.map((p) => (
            <li key={p.title} className="rounded-2xl bg-teal-50 p-5">
              <h3 className="font-bold text-teal-900">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{p.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How one request flows">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-slate-200 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Why Solana"
        lead="Not a badge on the website: the chain is where the money and the proof actually live."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>Escrow program (Anchor).</b> The bounty is locked in a task account when the request is
              created. Neither the operator nor the requester can touch it until the result is final.
              {programId ? (
                <span className="mt-1 block break-all font-mono text-xs text-slate-500">
                  program {programId}
                </span>
              ) : null}
            </li>
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>Result attestation.</b> The evidence root and the result hash are written on chain in the
              settlement transaction. The public result page re-reads the account from the browser and
              compares.
            </li>
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>Per-task USDC payouts.</b> Bounties are cents, not dollars. Workers get an embedded wallet at
              login and never need SOL: the operator pays fees.
            </li>
            <li className="rounded-2xl border border-slate-200 p-4">
              <b>x402 pay-per-request.</b> An agent with a wallet gets a 402 with the terms, signs a USDC
              transfer and retries. The operator acts as facilitator and fee payer. No account, no key, no
              invoice.
            </li>
          </ul>
          <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-5 text-xs leading-relaxed text-slate-100">
            {`{
  "status": "VERIFIED",
  "answer": "OPEN",
  "witnesses": { "valid": 2, "required": 2, "quorum": 2 },
  "checks": {
    "geofence": "pass", "freshness": "pass",
    "task_nonce": "pass", "replay": "pass",
    "duplicate": "pass", "vision_consistency": "pass"
  },
  "reviews": [{ "verdict": "pass", "reason": "…", "model": "claude-opus-5-5" }],
  "evidence_root": "…", "result_hash": "…",
  "attestation": {
    "network": "solana-devnet",
    "signature": "…", "explorer_url": "https://explorer.solana.com/tx/…"
  },
  "settlement": { "status": "SETTLED" },
  "proof": { "url": "https://…/r/ver_…", "badge_url": "…/badge.svg" }
}`}
          </pre>
        </div>
      </Section>

      <Section
        title="Built for more than shops"
        lead="The same rails carry work that matters to people who are not building agents."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [
              "Work from home",
              "Document transcription, reading a manual, phoning a clinic, measuring a desk: tasks that need no place, listed for people who cannot easily go out. No location permission required.",
            ],
            [
              "Facts for everyone",
              `A requester can publish a verified fact to a public map for ${LIMITS.publicMap.maxAgeHours} hours: a station elevator that works, a shelter that is open. One request helps the next person.`,
            ],
            [
              "Watch until it changes",
              "“Tell me when the elevator works again.” A watch keeps asking people at an interval and stops at the first verified answer that matches — each run paid like any other.",
            ],
          ].map(([t, b]) => (
            <div key={t} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="font-bold">{t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Try it in the next five minutes">
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/try" className="rounded-2xl border border-slate-200 p-5 hover:border-teal-600">
            <h3 className="font-bold">1. Play both sides</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Agent on the left, worker's phone on the right. Send a summary and watch the AI send it back;
              transcribe it and watch the payout land. Nothing is spent.
            </p>
          </Link>
          <Link
            href="/en/developers"
            className="rounded-2xl border border-slate-200 p-5 hover:border-teal-600"
          >
            <h3 className="font-bold">2. Connect your agent</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Add the MCP server to Claude or ChatGPT, or pay with x402 from a script. Real people in Tokyo
              answer.
            </p>
          </Link>
          <Link href="/demo" className="rounded-2xl border border-slate-200 p-5 hover:border-teal-600">
            <h3 className="font-bold">3. Verify a result on chain</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              A real result, field by field, with an in-browser check against the Solana account that holds
              its hash.
            </p>
          </Link>
        </div>
        <p className="mt-6 text-sm text-slate-600">
          Pilot limits: workers join by invitation; bounties are test USDC on Devnet. Source code and the full
          specification set are available to judges on request.
        </p>
      </Section>
    </>
  );
}
