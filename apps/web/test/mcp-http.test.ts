// MCP over HTTP (05 §6.1): Bearer API key, principal filled from the key, same REST rules, follow-up jobs kicked.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach, describe, expect, it } from "vitest";
import { handleMcp } from "../lib/mcp-http";
import { createBody, createTestApp } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
let kicked: string[];
beforeEach(async () => {
  t = await createTestApp();
  kicked = [];
});

const mcpFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
  handleMcp(t.app, new Request(input, init), (keys) => kicked.push(...keys))) as typeof fetch;

async function connect(apiKey: string) {
  const transport = new StreamableHTTPClientTransport(new URL("http://pm.test/mcp"), {
    fetch: mcpFetch,
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  const mcp = new Client({ name: "remote-agent", version: "1" });
  await mcp.connect(transport);
  return mcp;
}

describe("POST /mcp", () => {
  it("rejects a missing or wrong key with 401 and WWW-Authenticate", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    for (const auth of [undefined, "Bearer pm_test_00000000_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]) {
      const res = await mcpFetch("http://pm.test/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(auth ? { authorization: auth } : {}),
        },
        body,
      });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
    }
  });

  it("request without principal_ref -> owner's principal; retry is idempotent; cancel kicks the refund", async () => {
    const mcp = await connect(t.apiKey);
    const { tools } = await mcp.listTools();
    expect(tools).toHaveLength(4);

    const { principal_ref: _p, ...args } = createBody(t.principalId);
    type Created = { structuredContent: { verification_id: string; replayed: boolean } };
    const r1 = (await mcp.callTool({
      name: "request_reality_verification",
      arguments: args,
    })) as unknown as Created;
    const r2 = (await mcp.callTool({
      name: "request_reality_verification",
      arguments: args,
    })) as unknown as Created;
    const id = r1.structuredContent.verification_id;
    expect(r2.structuredContent).toMatchObject({ verification_id: id, replayed: true });
    expect(kicked).toContain(`FUND_TASK:${id}`);

    const g = (await mcp.callTool({
      name: "get_reality_verification",
      arguments: { verification_id: id },
    })) as unknown as {
      structuredContent: { status: string; result: unknown };
    };
    expect(g.structuredContent.result).toBeNull();

    const c = (await mcp.callTool({
      name: "cancel_reality_verification",
      arguments: { verification_id: id },
    })) as unknown as {
      structuredContent: { status: string };
    };
    expect(c.structuredContent.status).toBe("CANCELLED");
    expect(kicked).toContain(`REFUND_TASK:${id}`);
  });
});
