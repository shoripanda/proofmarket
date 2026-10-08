// MCP tool definitions (05 §6, api-contract.md §10). Descriptions are registered verbatim.

import { TASK_TYPE_SPECS } from "@proofmarket/core";
import {
  AssuranceCountsOrLevelSchema,
  AssuranceInputSchema,
  CreateScheduleRequestSchema,
  CreateVerificationBatchRequestSchema,
  CreateVerificationRequestSchema,
  VerificationIdSchema,
} from "@proofmarket/core/schemas/api";
import { z } from "zod";

const TYPE_GUIDE = Object.entries(TASK_TYPE_SPECS)
  .map(([t, sp]) => {
    const values = "values" in sp ? sp.values : null;
    const ans =
      sp.answer === "enum"
        ? `enum ${values ? values.join("/") : "(your own 2-6 choices)"}`
        : sp.answer === "number"
          ? 'number (e.g. { "type": "number", "unit": "JPY" })'
          : "text";
    return `${t}: ${ans}${sp.location === "optional" ? ", location optional" : ""}`;
  })
  .join("; ");

export const REQUEST_TOOL = {
  name: "request_reality_verification",
  title: "Request a real-world verification",
  description:
    "Ask a real human to do something in the physical world that an AI cannot: check a place (is a shop open, how long " +
    "is the queue, are seats or parking free, is an item in stock, what is the price), transcribe a sign, menu, book or " +
    "paper document, answer a question from a printed source, inspect a physical product, phone someone and report, " +
    "measure an object, or any other hands-on task. " +
    "This is asynchronous: a person must do the work, so results typically take 10–60 minutes. " +
    "This tool returns a verification_id immediately (or, with wait_seconds, the state after waiting that long). " +
    "KEEP THE PERSON INFORMED WITHOUT BEING ASKED: right after this call, tell them what was requested and that a " +
    "human is on it; then call get_reality_verification with wait_seconds=45 again and again while they wait, and " +
    "each time `summary` changes, repeat it to them (summary.ja or summary.en, whichever language they use). When " +
    "the result arrives, give them the answer, the AI review verdict and its reason (result.reviews), and the proof " +
    "link, in your reply — do not wait for them to ask how it went. " +
    "Never assume or invent the outcome before the result status is VERIFIED, REJECTED or EXPIRED. " +
    `Types and answer_schema: ${TYPE_GUIDE}. ` +
    "Text types also take a form: { type: 'form', fields: [{ key, label, type: enum|number|text|scale, ... }] } (1-8 fields) " +
    "when you need several things back at once (say a price, a stock status and a note); the answer comes back as one " +
    "JSON object per witness. The 17 types are examples: CUSTOM_TASK / CUSTOM_CHOICE take any hands-on work. " +
    "acceptance_criteria (up to 500 chars) tells the worker and the AI review what you will accept. " +
    "A scale field ({ type: 'scale', max: 5 or 10, labels: [low end, high end] }) measures a sense such as noise or " +
    "smell; with 3 or more witnesses, result.aggregate gives the median, min and max per number or scale field. " +
    "attestation: { subject: 'agent_action', description } (up to 200 chars) has a person confirm something you, the " +
    "agent, did (delivered a parcel, installed a device, cleaned a room), and the public proof page says so. " +
    "assurance: { level: 'optimistic', challenge_minutes: 10-120 } gives a provisional answer from one person within " +
    "minutes (result.provisional, result.challenge.until); anyone may challenge it over REST for a bond of twice the " +
    "bounty until the window closes, and it is final after that. Choice and number answers only. " +
    "location is required for at-a-place types and may be omitted for work that can be done anywhere; " +
    "deadline is within 24 h for work at a place and up to 7 days without one. " +
    "For text answers, result.answers holds every accepted text and result.answer is the SHA-256 of the first. " +
    "An API key may allow only some types. " +
    "bounty.max_amount and ramp_minutes raise the reward from amount toward max_amount until someone takes the task " +
    "(the amount at the first claim is what every witness is paid; max_amount × witnesses is reserved). " +
    "publish: true puts the verified result on the public map for 72 hours so other people can use it too; this makes " +
    "the question, place, answer and time public, so set it only for facts about public places with nothing private " +
    "in the question (needs a location and a choice or number answer). " +
    'location_privacy: "coarse" shows the place on public pages only to about 1 km (and hides the shop name); ' +
    "the requester still sees it exact. " +
    "Without an API key, any agent with a Solana wallet can make the same request over HTTP by paying in USDC with " +
    "x402: POST /v1/x402/verifications (same body without principal_ref) answers 402 with the payment terms.",
  inputSchema: {
    ...CreateVerificationRequestSchema.omit({ principal_ref: true }).shape,
    principal_ref: CreateVerificationRequestSchema.shape.principal_ref
      .optional()
      .describe("Defaults to the principal bound to PROOFMARKET_API_KEY"),
    idempotency_key: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe(
        "Defaults to SHA-256 of the canonicalized arguments, so an identical retry never creates a second task",
      ),
    wait_seconds: z
      .number()
      .int()
      .min(0)
      .max(45)
      .default(0)
      .describe(
        "After creating the request, wait up to this long for someone to take it or a result to land, and return the " +
          "state (with summary) as it stands. Most tasks take longer than 45 s: keep calling get_reality_verification.",
      ),
  },
} as const;

export const BATCH_TOOL = {
  name: "request_reality_verifications_batch",
  title: "Request many real-world verifications at once",
  description:
    "Send one request body to many places, or many questions to one place, in a single call: the same shelf check " +
    "at 30 shops, the same price question across a city, a set of different questions about one site. " +
    "template is a normal request_reality_verification body without location/question; each item adds its own " +
    "location and/or question. Up to 50 items. All items are created or none is (one error names details.index). " +
    "Each result is a separate verification_id to poll with get_reality_verification; the total bounty is " +
    "amount × witnesses × items and must fit the key's limits.",
  inputSchema: {
    template: CreateVerificationBatchRequestSchema.shape.template.omit({ principal_ref: true }).extend({
      principal_ref: CreateVerificationRequestSchema.shape.principal_ref
        .optional()
        .describe("Defaults to the principal bound to PROOFMARKET_API_KEY"),
    }),
    items: CreateVerificationBatchRequestSchema.shape.items,
    idempotency_key: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe(
        "Defaults to SHA-256 of the canonicalized arguments, so an identical retry never creates a second batch",
      ),
  },
} as const;

export const GET_TOOL = {
  name: "get_reality_verification",
  title: "Get a real-world verification",
  description:
    "Read the current state and, when available, the machine-readable result of a verification. " +
    "If wait_seconds is set, waits up to that long for a state change, then returns the latest state as-is. " +
    "While the person you work for is waiting, call this with wait_seconds=45 in a loop and tell them what changed. " +
    "`summary` is one paragraph written for a person (ja and en): who is on it, how many submissions the AI review " +
    "is checking or sent back, the final answer and why it is final — repeat it to them as it changes, unasked. " +
    "A status other than VERIFIED, REJECTED or EXPIRED means the human check is still in progress. " +
    "When the result is in, also pass on result.reviews (the AI review's verdict and reason for each submission). " +
    "Once there is a result, result.proof.url is a public page showing that a human checked this, when, by how many " +
    "people, and the Solana record: give that link (or result.proof.markdown, a badge) to the person you are answering.",
  inputSchema: {
    verification_id: VerificationIdSchema,
    wait_seconds: z.number().int().min(0).max(45).default(0),
  },
} as const;

export const WATCH_TOOL = {
  name: "watch_reality_verification",
  title: "Watch a real-world fact until it changes",
  description:
    "Keep checking something with real people until the answer you are waiting for comes back, then stop: " +
    "'tell me when the station elevator works again', 'when this item is back on the shelf', 'when the queue is short'. " +
    "Every run is a normal paid verification (same request body as request_reality_verification, without deadline). " +
    "Choose every_minutes (15–1440, first run right away) or fixed times_jst + days_jst (Japan time). " +
    "stop_when ends the watch at the first VERIFIED result that matches: {answer}, {answer_in} for choice answers, " +
    "{number: {min, max}} for number answers; not for text answers. Set max_runs to cap the cost. " +
    "Read progress with list_reality_verification_watches: stopped_reason is condition_met and matched_verification_id " +
    "names the run that matched (read it with get_reality_verification). A verification.verified webhook also fires.",
  inputSchema: {
    ...CreateScheduleRequestSchema.shape,
    request: CreateVerificationRequestSchema.omit({ deadline: true, principal_ref: true })
      .extend({
        principal_ref: CreateVerificationRequestSchema.shape.principal_ref
          .optional()
          .describe("Defaults to the principal bound to PROOFMARKET_API_KEY"),
      })
      .strict(),
  },
} as const;

export const LIST_WATCHES_TOOL = {
  name: "list_reality_verification_watches",
  title: "List watches and recurring checks",
  description:
    "Every watch and recurring check of this API key, with next_run_at, runs, last_verification_id, " +
    "stopped_reason (condition_met, max_runs, ended, failures, suspended, stopped) and matched_verification_id.",
  inputSchema: {},
} as const;

export const STOP_WATCH_TOOL = {
  name: "stop_reality_verification_watch",
  title: "Stop a watch or recurring check",
  description: "Stop it now. Runs already created keep going and are paid as usual.",
  inputSchema: { schedule_id: z.string().regex(/^sch_/) },
} as const;

export const CANCEL_TOOL = {
  name: "cancel_reality_verification",
  title: "Cancel a real-world verification",
  description:
    "Cancel a verification that no witness has started. Fails with TASK_NOT_CANCELLABLE once a witness is on the way " +
    "or a valid submission exists. Funds are refunded to the prepaid balance.",
  inputSchema: { verification_id: VerificationIdSchema },
} as const;

export const DISPUTE_TOOL = {
  name: "dispute_reality_verification",
  title: "Dispute a real-world verification",
  description:
    "Ask for a recheck of a VERIFIED or REJECTED result you doubt, once and within 24 hours of the result. " +
    "This creates a new verification at the same place with the same question (default: two witnesses must agree), " +
    "which you pay for like any request. Returns recheck_verification_id; poll it with get_reality_verification. " +
    "The original result and its payments stay as they are.",
  inputSchema: {
    verification_id: VerificationIdSchema,
    reason: z.string().max(500).optional(),
    assurance: AssuranceCountsOrLevelSchema.optional(),
    deadline_minutes: z.number().int().min(10).max(1440).optional(),
  },
} as const;
