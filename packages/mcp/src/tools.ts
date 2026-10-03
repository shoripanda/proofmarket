// MCP tool definitions (05 §6, api-contract.md §10). Descriptions are registered verbatim.

import {
  AssuranceInputSchema,
  CreateVerificationRequestSchema,
  VerificationIdSchema,
} from "@proofmarket/core/schemas/api";
import { z } from "zod";

export const REQUEST_TOOL = {
  name: "request_reality_verification",
  title: "Request a real-world verification",
  description:
    "Ask a real human witness to check a fact about a public physical place (for example, whether a shop is open right now). " +
    "This is asynchronous: a person must travel to the location, so results typically take 10–60 minutes. " +
    "This tool returns a verification_id immediately; call get_reality_verification to read the result. " +
    "Never assume or invent the outcome before the result status is VERIFIED, REJECTED or EXPIRED. " +
    "Types: PLACE_STATUS_VERIFICATION (answers OPEN / CLOSED / UNCLEAR), QUEUE_LENGTH (NO_QUEUE / SHORT_QUEUE = up to about 5 people / LONG_QUEUE = 6 or more / UNCLEAR, people queuing outside), " +
    "NOTICE_POSTED (POSTED / NOT_POSTED / UNCLEAR, whether the notice named in the question is posted at the storefront). " +
    "An API key may allow only some types.",
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
    "A status other than VERIFIED, REJECTED or EXPIRED means the human check is still in progress.",
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
