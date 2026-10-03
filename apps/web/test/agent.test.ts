// Agent-side integration: SDK and MCP against the real handlers (REQ-A-002, REQ-X-D-101/102, api-contract §10).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "@proofmarket/mcp";
import { isDecided, ProofMarketApiError, ProofMarketClient } from "@proofmarket/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { handlePublicResult } from "../lib/handlers/requester";
import { tick } from "../lib/services/jobs";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { inProcessFetch } from "./support/router";
import { onboardWorker, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let client: ProofMarketClient;
beforeEach(async () => {
  t = await createTestApp();
  client = new ProofMarketClient({
    baseUrl: "http://pm.test",
    apiKey: t.apiKey,
    fetch: inProcessFetch(t.app),
  });
});

describe("SDK", () => {
  it("create (replay-aware) -> get -> decided after a witness + settle", async () => {
    const body = createBody(t.principalId) as Parameters<typeof client.createVerification>[0];
    const a = await client.createVerification(body, "sdk-1");
    const b = await client.createVerification(body, "sdk-1");
    expect(a.replayed).toBe(false);
    expect(b).toMatchObject({ verification_id: a.verification_id, replayed: true });
    await tick(t.app);
    const alice = (await onboardWorker(t, "alice")).token;
    await witness(t, alice, a.verification_id, { answer: "CLOSED" });
    await tick(t.app);
    const v = await client.getVerification(a.verification_id);
    expect(isDecided(v)).toBe(true);
    expect(v.result?.answer).toBe("CLOSED");
  });

  it("errors surface as ProofMarketApiError with code and retryable", async () => {
    const e = await client
      .createVerification(
        createBody(t.principalId, { question: "Secretly film the cashier" }) as never,
        "sdk-2",
      )
      .catch((x) => x);
    expect(e).toBeInstanceOf(ProofMarketApiError);
    expect(e).toMatchObject({ code: "TASK_POLICY_VIOLATION", retryable: false, status: 422 });
  });

  it("waitForResult returns the latest state at timeout instead of inventing a result", async () => {
    const { verification_id } = await client.createVerification(createBody(t.principalId) as never, "sdk-3");
    const v = await client.waitForResult(verification_id, { timeoutMs: 30, intervalMs: 10 });
    expect(v.result).toBeNull();
    expect(isDecided(v)).toBe(false);
  });
});

describe("MCP tools", () => {
  async function connect() {
    const server = createServer(client, { principalRef: t.principalId, sleep: async () => undefined });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const mcp = new Client({ name: "test-agent", version: "1" });
    await Promise.all([server.connect(a), mcp.connect(b)]);
    return mcp;
  }

  it("lists the three tools with the asynchronous warning in the description", async () => {
    const mcp = await connect();
    const { tools } = await mcp.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual([
      "cancel_reality_verification",
      "get_reality_verification",
      "request_reality_verification",
    ]);
    expect(tools.find((x) => x.name === "request_reality_verification")?.description).toMatch(
      /Never assume or invent the outcome/,
    );
  });

  it("request -> identical retry creates no second task -> get -> cancel", async () => {
    const mcp = await connect();
    const { principal_ref: _p, ...args } = createBody(t.principalId);
    const r1 = (await mcp.callTool({ name: "request_reality_verification", arguments: args })) as unknown as {
      structuredContent: { verification_id: string };
    };
    const r2 = (await mcp.callTool({ name: "request_reality_verification", arguments: args })) as unknown as {
      structuredContent: { verification_id: string; replayed: boolean };
    };
    expect(r2.structuredContent).toMatchObject({
      verification_id: r1.structuredContent.verification_id,
      replayed: true,
    });
    const g = (await mcp.callTool({
      name: "get_reality_verification",
      arguments: { verification_id: r1.structuredContent.verification_id, wait_seconds: 4 },
    })) as unknown as {
      structuredContent: { status: string; result: unknown };
    };
    expect(g.structuredContent).toMatchObject({ status: "CREATED", result: null });
    const c = (await mcp.callTool({
      name: "cancel_reality_verification",
      arguments: { verification_id: r1.structuredContent.verification_id },
    })) as unknown as {
      structuredContent: { status: string };
    };
    expect(c.structuredContent.status).toBe("CANCELLED");
  });

  it("API errors come back as isError tool results, not exceptions", async () => {
    const mcp = await connect();
    const r = (await mcp.callTool({
      name: "get_reality_verification",
      arguments: { verification_id: "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1" },
    })) as unknown as {
      isError: boolean;
      structuredContent: { error: { code: string } };
    };
    expect(r.isError).toBe(true);
    expect(r.structuredContent.error.code).toBe("VERIFICATION_NOT_FOUND");
  });
});

describe("public result", () => {
  it("is available without auth after the outcome and hides question, location and rejected details", async () => {
    const { verification_id: id } = await client.createVerification(
      createBody(t.principalId) as never,
      "pub-1",
    );
    expect((await call((r) => handlePublicResult(t.app, r, id), jsonReq("GET", "/x"))).status).toBe(404);
    await tick(t.app);
    await witness(t, (await onboardWorker(t, "alice")).token, id);
    await tick(t.app);
    const res = await call((r) => handlePublicResult(t.app, r, id), jsonReq("GET", "/x"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "VERIFIED", settlement: { status: "SETTLED" } });
    expect(JSON.stringify(body)).not.toMatch(/question|Is this shop|35\.65|rejected_submissions|wkr_/);
  });
});
