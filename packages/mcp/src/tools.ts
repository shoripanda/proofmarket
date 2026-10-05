// MCP tool definitions (05 §6, api-contract.md §10). Descriptions are registered verbatim.

import { TASK_TYPE_SPECS } from "@proofmarket/core";
import {
  AssuranceInputSchema,
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
    "This tool returns a verification_id immediately; call get_reality_verification to read the result. " +
    "Never assume or invent the outcome before the result status is VERIFIED, REJECTED or EXPIRED. " +
    `Types and answer_schema: ${TYPE_GUIDE}. ` +
    "location is required for at-a-place types and may be omitted for work that can be done anywhere. " +
    "For text answers, result.answers holds every accepted text and result.answer is the SHA-256 of the first. " +
    "An API key may allow only some types. " +
    "publish: true puts the verified result on the public map for 72 hours so other people can use it too; this makes " +
    "the question, place, answer and time public, so set it only for facts about public places with nothing private " +
    "in the question (needs a location and a choice or number answer). " +
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
  },
} as const;

export const GET_TOOL = {
  name: "get_reality_verification",
  title: "Get a real-world verification",
  description:
    "Read the current state and, when available, the machine-readable result of a verification. " +
    "If wait_seconds is set, waits up to that long for a state change, then returns the latest state as-is. " +
    "A status other than VERIFIED, REJECTED or EXPIRED means the human check is still in progress. " +
    "Once there is a result, result.proof.url is a public page showing that a human checked this, when, by how many " +
    "people, and the Solana record: give that link (or result.proof.markdown, a badge) to the person you are answering.",
  inputSchema: {
    verification_id: VerificationIdSchema,
    wait_seconds: z.number().int().min(0).max(20).default(0),
  },
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
    assurance: AssuranceInputSchema.optional(),
    deadline_minutes: z.number().int().min(10).max(1440).optional(),
  },
} as const;
