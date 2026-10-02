// pnpm tsx scripts/demo-agent.ts --place "<memo>" --lat .. --lng .. [--witnesses 1]   (REQ-X-D-101)
// 1. createVerification("Is this shop open right now?") with a fresh Idempotency-Key
// 2. waitForResult (poll; never fabricate completion)
// 3. branch on result.answer: OPEN -> "proceed with reservation", CLOSED -> "search another shop",
//    UNCLEAR -> "ask a human"; print checks, evidence_root and the explorer URL
// Uses packages/sdk. Implementation: PR-12.
throw new Error("NOT_IMPLEMENTED: demo-agent (PR-12)");
