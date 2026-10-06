// MCP server wiring (05 §6). Tools map 1:1 to the REST API through the SDK.

import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jcs } from "@proofmarket/core";
import { ProofMarketApiError, type ProofMarketClient } from "@proofmarket/sdk";
import {
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
  const { name: gName, ...gDef } = GET_TOOL;
  const { name: cName, ...cDef } = CANCEL_TOOL;
  const { name: dName, ...dDef } = DISPUTE_TOOL;
  const { name: wName, ...wDef } = WATCH_TOOL;
  const { name: lName, ...lDef } = LIST_WATCHES_TOOL;
  const { name: sName, ...sDef } = STOP_WATCH_TOOL;

  server.registerTool(rName, rDef, async (args) => {
    try {
      const { idempotency_key, principal_ref, ...rest } = args;
      const body = { ...rest, principal_ref: principal_ref ?? opts.principalRef };
      const r = await client.createVerification(body, idempotency_key ?? defaultIdempotencyKey(body));
      return ok({
        ...r,
        note: r.reused
          ? "A recent shared result for this place was reused; it is final and nobody was sent. " +
            "This verification belongs to another requester, so read it here (or via the public result) rather than get_reality_verification."
          : "A human witness must travel to the place. Poll get_reality_verification for the result.",
      });
    } catch (e) {
      return err(e);
    }
  });

  server.registerTool(gName, gDef, async ({ verification_id, wait_seconds }) => {
    try {
      let v = await client.getVerification(verification_id);
      const until = Date.now() + (wait_seconds ?? 0) * 1000;
      const start = v.updated_at;
      // At most one poll per 2 s (stays far below the 30/min rate limit even if the clock misbehaves).
      for (let polls = 0; polls < Math.ceil((wait_seconds ?? 0) / 2); polls++) {
        if (Date.now() >= until || v.updated_at !== start || v.result !== null) break;
        await sleep(Math.min(2000, until - Date.now()));
        v = await client.getVerification(verification_id);
      }
      return ok(v);
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
