// MCP over HTTP (05 §6.1): Bearer API key, principal filled from the key, same REST rules, follow-up jobs kicked.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach, describe, expect, it } from "vitest";
import { handleMcp } from "../lib/mcp-http";
import { createBody, createTestApp, SHOP } from "./support/app";

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
    expect(tools).toHaveLength(9);

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

  // The tools reach the REST handlers through lib/mcp-http.ts's TABLE; a missing row used to 404 in production.
  it("every tool that calls the API reaches its handler: batch and the three watch tools", async () => {
    const mcp = await connect(t.apiKey);
    type Out = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
    const callTool = async (name: string, args: Record<string, unknown>) => {
      const r = (await mcp.callTool({ name, arguments: args })) as unknown as Out;
      expect(r.isError, `${name}: ${r.content?.[0]?.text}`).toBeFalsy();
      return r.structuredContent;
    };

    const { location: _l, question: _q, principal_ref: _p, ...template } = createBody(t.principalId);
    const batch = (await callTool("request_reality_verifications_batch", {
      template,
      items: [
        { location: { ...SHOP, radius_m: 80 }, question: "Is shop A open?" },
        { location: { lat: 35.66, lng: 139.7, radius_m: 80 }, question: "Is shop B open?" },
      ],
    })) as { verifications: { verification_id: string }[] };
    expect(batch.verifications).toHaveLength(2);
    for (const v of batch.verifications) expect(kicked).toContain(`FUND_TASK:${v.verification_id}`);

    const { deadline: _d, principal_ref: _p2, ...request } = createBody(t.principalId);
    const w = (await callTool("watch_reality_verification", {
      request,
      deadline_minutes: 30,
      times_jst: ["12:30"],
      days_jst: [5],
    })) as { schedule_id: string };
    expect(w.schedule_id).toMatch(/^sch_/);

    const list = JSON.stringify(await callTool("list_reality_verification_watches", {}));
    expect(list).toContain(w.schedule_id);

    const stopped = await callTool("stop_reality_verification_watch", { schedule_id: w.schedule_id });
    expect(stopped).toMatchObject({ active: false });

    const assets = (await callTool("list_reward_assets", {})) as { assets: { symbol: string }[] };
    expect(assets.assets.map((a) => a.symbol)).toContain("USDC");
  });

  it("a path with no row is reported as an internal error, not as an unknown verification", async () => {
    const { inProcessFetch } = await import("../lib/mcp-http");
    const res = await inProcessFetch(t.app)("http://pm.test/v1/nowhere", { method: "GET" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});
