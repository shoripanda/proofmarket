// 01 §4.27: the verdict reaches the agent's user unasked — GET carries a human-readable summary and can wait,
// and the MCP tools say so in their notes.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate, handleGet } from "../lib/handlers/requester";
import { handleMcp } from "../lib/mcp-http";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

type View = {
  status: string;
  summary: { ja: string; en: string };
  witness_progress: { checking: number; returned: number; required: number };
  result: unknown;
};

async function create(): Promise<string> {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId),
      idem: crypto.randomUUID(),
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { verification_id: string }).verification_id;
}

describe("GET /v1/verifications/{id}: summary and ?wait", () => {
  it("every view carries a summary in both languages and the review counts", async () => {
    const id = await create();
    const res = await call(
      (r) => handleGet(t.app, r, id),
      jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }),
    );
    const v = (await res.json()) as View;
    expect(v.summary.ja).toContain("まだ引き受け手を待っています");
    expect(v.summary.en).toContain("Waiting for someone to take it");
    expect(v.witness_progress).toMatchObject({ checking: 0, returned: 0, required: 1 });
  });

  it("?wait returns when nothing changes, after about that long, with the state as it is", async () => {
    const id = await create();
    const t0 = Date.now();
    const res = await call(
      (r) => handleGet(t.app, r, id),
      jsonReq("GET", `/v1/verifications/${id}?wait=1`, { key: t.apiKey }),
    );
    const v = (await res.json()) as View;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(v.result).toBeNull();
    expect(v.summary.ja).toBeTruthy();
  });
});

describe("MCP: the tools tell the agent to relay the summary", () => {
  const mcpFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    handleMcp(t.app, new Request(input, init), () => {})) as typeof fetch;

  async function connect() {
    const transport = new StreamableHTTPClientTransport(new URL("http://pm.test/mcp"), {
      fetch: mcpFetch,
      requestInit: { headers: { Authorization: `Bearer ${t.apiKey}` } },
    });
    const mcp = new Client({ name: "agent", version: "1" });
    await mcp.connect(transport);
    return mcp;
  }

  it("request with wait_seconds returns the verification with its summary, and a note on what to tell the person", async () => {
    const mcp = await connect();
    const { principal_ref: _p, ...args } = createBody(t.principalId);
    const r = (await mcp.callTool({
      name: "request_reality_verification",
      arguments: { ...args, wait_seconds: 1 },
    })) as unknown as { structuredContent: { verification_id: string; verification?: View; note: string } };
    expect(r.structuredContent.verification?.summary.en).toContain("Waiting for someone");
    expect(r.structuredContent.note).toMatch(/Tell the person now/);

    const g = (await mcp.callTool({
      name: "get_reality_verification",
      arguments: { verification_id: r.structuredContent.verification_id },
    })) as unknown as { structuredContent: View & { note: string } };
    expect(g.structuredContent.summary.ja).toContain("まだ引き受け手を待っています");
    expect(g.structuredContent.note).toMatch(/Still in progress/);

    const { tools } = await mcp.listTools();
    const req = tools.find((x) => x.name === "request_reality_verification");
    expect(req?.description).toMatch(/KEEP THE PERSON INFORMED/);
    expect(req?.inputSchema.properties).toHaveProperty("wait_seconds");
  });
});
