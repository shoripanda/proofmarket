// MCP over HTTP (05 §6.1): Bearer API key, principal filled from the key, same REST rules, follow-up jobs kicked.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { schema } from "@proofmarket/db";
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
    expect(tools).toHaveLength(10);

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

    const listed = (await callTool("list_reality_verifications", { limit: 10 })) as {
      verifications: { verification_id: string }[];
    };
    expect(listed.verifications.map((v) => v.verification_id).sort()).toEqual(
      batch.verifications.map((v) => v.verification_id).sort(),
    );
  });

  it("confirm: false quotes without reserving; quote_id then confirms (docs/architecture 04 §4.2)", async () => {
    const mcp = await connect(t.apiKey);
    const { principal_ref: _p, ...args } = createBody(t.principalId);
    type Quote = {
      structuredContent: { quote_id: string; total: string; balance_after: string; note: string };
    };
    const q = (await mcp.callTool({
      name: "request_reality_verification",
      arguments: { ...args, confirm: false },
    })) as unknown as Quote;
    expect(q.structuredContent).toMatchObject({ total: "0.5", balance_after: "9.5" });
    expect(q.structuredContent.note).toContain(q.structuredContent.quote_id);
    expect(kicked).toEqual([]);
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(0);

    const r = (await mcp.callTool({
      name: "request_reality_verification",
      arguments: { ...args, quote_id: q.structuredContent.quote_id },
    })) as unknown as { structuredContent: { verification_id: string } };
    expect(kicked).toContain(`FUND_TASK:${r.structuredContent.verification_id}`);
  });

  it("offers the ChatGPT widget as a resource and names it in the request / get tools' _meta (02 §4.3)", async () => {
    const mcp = await connect(t.apiKey);
    const { resources } = await mcp.listResources();
    expect(resources.map((r) => r.uri)).toEqual(["ui://widget/verification.html"]);
    const read = await mcp.readResource({ uri: "ui://widget/verification.html" });
    const c = read.contents[0] as { mimeType: string; text: string };
    expect(c.mimeType).toBe("text/html+skybridge");
    expect(c.text).toContain("window.openai");
    expect(c.text).not.toMatch(/<script src=|https?:\/\//); // self-contained: nothing loaded from outside
    const { tools } = await mcp.listTools();
    const meta = (n: string) => tools.find((x) => x.name === n)?._meta as Record<string, unknown> | undefined;
    expect(meta("get_reality_verification")?.["openai/outputTemplate"]).toBe("ui://widget/verification.html");
    expect(meta("request_reality_verification")?.["openai/outputTemplate"]).toBe(
      "ui://widget/verification.html",
    );
    expect(meta("cancel_reality_verification")).toBeUndefined();
  });

  it("a path with no row is reported as an internal error, not as an unknown verification", async () => {
    const { inProcessFetch } = await import("../lib/mcp-http");
    const res = await inProcessFetch(t.app)("http://pm.test/v1/nowhere", { method: "GET" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});
