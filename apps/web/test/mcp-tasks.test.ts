// MCP tools for general tasks (docs/architecture 13 §7.2): hidden while the flag is off; create_task posts only
// after a dry run and an explicit confirm.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PLATFORM_FEE_BPS } from "@proofmarket/core";
import { beforeEach, describe, expect, it } from "vitest";
import { handleMcp } from "../lib/mcp-http";
import { setFlag } from "../lib/services/admin-service";
import { createTestApp } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
  t.app.config.platformFeeBps = PLATFORM_FEE_BPS;
});

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

const args = {
  title: "Proofread a short Japanese leaflet",
  description: "Read the attached 200-character leaflet text and list any typos or unnatural phrases.",
  completion_criteria: "A list of every change, or a note that none are needed",
  evidence_types: ["text"],
  remote_ok: true,
  price: { asset: "USDC", amount: "2", network: "solana-devnet" },
  deadline: "2026-10-11T03:00:00Z",
};

describe("MCP task tools", () => {
  it("are not listed while tasks_enabled is off", async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((x) => x.name)).not.toContain("create_task");
  });

  it("dry run, refuse without confirm, then post; the result is readable with get_task", async () => {
    await setFlag(t.db, "tasks_enabled", true, "test");
    const mcp = await connect();
    const names = (await mcp.listTools()).tools.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(["create_task", "get_task", "decide_task_seat"]));

    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    const dry = (await mcp.callTool({ name: "create_task", arguments: { ...args, dry_run: true } })) as any;
    expect(dry.structuredContent).toMatchObject({ dry_run: true, cost: { total: "2.3" } });

    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    const refused = (await mcp.callTool({
      name: "create_task",
      arguments: { ...args, dry_run: false },
    })) as any;
    expect(refused.isError).toBe(true);

    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    const posted = (await mcp.callTool({
      name: "create_task",
      arguments: { ...args, dry_run: false, confirm: true },
    })) as any;
    const id = posted.structuredContent.task_id as string;
    expect(id).toMatch(/^tsk_/);
    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    const got = (await mcp.callTool({ name: "get_task", arguments: { task_id: id } })) as any;
    expect(got.structuredContent).toMatchObject({ status: "OPEN", cost: { total: "2.3" } });
  });
});
