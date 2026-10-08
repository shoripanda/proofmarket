// MCP server wiring (05 §6). Tools map 1:1 to the REST API through the SDK.

import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jcs } from "@proofmarket/core";
import { ProofMarketApiError, type ProofMarketClient } from "@proofmarket/sdk";
import {
  BATCH_TOOL,
  CANCEL_TOOL,
  DISPUTE_TOOL,
  GET_TOOL,
  LIST_WATCHES_TOOL,
  REQUEST_TOOL,
  STOP_WATCH_TOOL,
  WATCH_TOOL,
} from "./tools.ts";

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data as Record<string, unknown>,
});

const err = (e: unknown): ToolResult => {
  if (e instanceof ProofMarketApiError) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(e.body, null, 2) }],
      structuredContent: e.body as unknown as Record<string, unknown>,
    };
  }
  return { isError: true, content: [{ type: "text", text: `ProofMarket request failed: ${String(e)}` }] };
};

/** Default Idempotency-Key: an identical retry by the agent never creates a second task (05 §6). */
export function defaultIdempotencyKey(args: unknown): string {
  return `mcp-${createHash("sha256").update(jcs(args)).digest("hex").slice(0, 48)}`;
}

export function createServer(
  client: ProofMarketClient,
  opts: { principalRef: string; sleep?: (ms: number) => Promise<void> },
): McpServer {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const server = new McpServer({ name: "proofmarket", version: "0.1.0" });
  const { name: rName, ...rDef } = REQUEST_TOOL;
  const { name: bName, ...bDef } = BATCH_TOOL;
  const { name: gName, ...gDef } = GET_TOOL;
  const { name: cName, ...cDef } = CANCEL_TOOL;
  const { name: dName, ...dDef } = DISPUTE_TOOL;
  const { name: wName, ...wDef } = WATCH_TOOL;
  const { name: lName, ...lDef } = LIST_WATCHES_TOOL;
  const { name: sName, ...sDef } = STOP_WATCH_TOOL;

  /** GET, then re-read every 3 s until the state changes, a result lands, or `seconds` pass (01 §4.27). */
  async function awaitChange(verification_id: string, seconds: number) {
    let v = await client.getVerification(verification_id);
    const until = Date.now() + seconds * 1000;
    const start = v.updated_at;
    // At most one poll per 3 s (stays far below the 30/min rate limit even if the clock misbehaves).
    for (let polls = 0; polls < Math.ceil(seconds / 3); polls++) {
      if (Date.now() >= until || v.updated_at !== start || v.result !== null) break;
      await sleep(Math.min(3000, until - Date.now()));
      v = await client.getVerification(verification_id);
    }
    return v;
  }

  const RELAY =
    "Tell the person now what was asked and that a human is on it. Then call get_reality_verification with " +
    "wait_seconds=45 while they wait and repeat `summary` to them whenever it changes; when the result lands, give " +
    "them the answer, the AI review's verdict and reason, and the proof link without being asked.";

  server.registerTool(rName, rDef, async (args) => {
    try {
      const { idempotency_key, principal_ref, wait_seconds, ...rest } = args;
      const body = { ...rest, principal_ref: principal_ref ?? opts.principalRef };
      const r = await client.createVerification(body, idempotency_key ?? defaultIdempotencyKey(body));
      if (r.reused) {
        return ok({
          ...r,
          note:
            "A recent shared result for this place was reused; it is final and nobody was sent. " +
            "This verification belongs to another requester, so read it here (or via the public result) rather than get_reality_verification.",
        });
      }
      const verification = wait_seconds ? await awaitChange(r.verification_id, wait_seconds) : null;
      return ok({
        ...r,
        ...(verification ? { verification } : {}),
        note: `A human must do the work; this usually takes 10–60 minutes. ${RELAY}`,
      });
    } catch (e) {
      return err(e);
    }
  });

  server.registerTool(bName, bDef, async (args) => {
    try {
      const { idempotency_key, template, items } = args;
      const { principal_ref, ...rest } = template;
      const body = { template: { ...rest, principal_ref: principal_ref ?? opts.principalRef }, items };
      const r = await client.createVerificationBatch(body, idempotency_key ?? defaultIdempotencyKey(body));
      return ok({
        ...r,
        note: `${r.verifications.length} verifications created. Each needs a human; poll get_reality_verification per verification_id.`,
      });
    } catch (e) {
      return err(e);
    }
  });

  server.registerTool(gName, gDef, async ({ verification_id, wait_seconds }) => {
    try {
      const v = await awaitChange(verification_id, wait_seconds ?? 0);
      const decided = v.result !== null && !v.result.provisional;
      return ok({
        ...v,
        note: decided
          ? "Final. Repeat `summary` (and result.reviews, the proof link) to the person you work for now."
          : "Still in progress. Repeat `summary` to the person if it changed, then call again with wait_seconds=45.",
      });
    } catch (e) {
      return err(e);
    }
  });

  server.registerTool(cName, cDef, async ({ verification_id }) => {
    try {
      return ok(await client.cancelVerification(verification_id));
    } catch (e) {
      return err(e);
    }
  });
  server.registerTool(dName, dDef, async ({ verification_id, ...body }) => {
    try {
      return ok(await client.disputeVerification(verification_id, body));
    } catch (e) {
      return err(e);
    }
  });

  // Watches (01 §4.23): the schedule API with the owner's principal filled in.
  server.registerTool(wName, wDef, async (args) => {
    try {
      const { request, ...rest } = args;
      const s = await client.createSchedule({
        ...rest,
        request: { ...request, principal_ref: request.principal_ref ?? opts.principalRef },
      });
      return ok({
        ...s,
        note: s.stop_when
          ? "Runs continue until a VERIFIED answer matches stop_when (or max_runs/ends_at). Each run is paid. " +
            "Check list_reality_verification_watches for stopped_reason=condition_met and matched_verification_id."
          : "Runs continue on this schedule until stopped. Each run is paid.",
      });
    } catch (e) {
      return err(e);
    }
  });
  server.registerTool(lName, lDef, async () => {
    try {
      return ok(await client.listSchedules());
    } catch (e) {
      return err(e);
    }
  });
  server.registerTool(sName, sDef, async ({ schedule_id }) => {
    try {
      return ok(await client.stopSchedule(schedule_id));
    } catch (e) {
      return err(e);
    }
  });

  return server;
}
