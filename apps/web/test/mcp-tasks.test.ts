// MCP tools for general tasks (docs/architecture 13 §7.2): hidden while the flag is off; create_task posts only
// after a dry run and an explicit confirm.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PLATFORM_FEE_BPS } from "@proofmarket/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleWorkerApply,
  handleWorkerDeliver,
  handleWorkerSeatMessages,
} from "../lib/handlers/market-tasks";
import { handleMcp } from "../lib/mcp-http";
import { setFlag } from "../lib/services/admin-service";
import { tick } from "../lib/services/jobs";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker } from "./support/worker";

// biome-ignore lint/suspicious/noExplicitAny: test convenience
type Any = any;

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

    const dry = (await mcp.callTool({ name: "create_task", arguments: { ...args, dry_run: true } })) as Any;
    expect(dry.structuredContent).toMatchObject({ dry_run: true, cost: { total: "2.3" } });

    const refused = (await mcp.callTool({
      name: "create_task",
      arguments: { ...args, dry_run: false },
    })) as Any;
    expect(refused.isError).toBe(true);

    const posted = (await mcp.callTool({
      name: "create_task",
      arguments: { ...args, dry_run: false, confirm: true },
    })) as Any;
    const id = posted.structuredContent.task_id as string;
    expect(id).toMatch(/^tsk_/);
    const got = (await mcp.callTool({ name: "get_task", arguments: { task_id: id } })) as Any;
    expect(got.structuredContent).toMatchObject({ status: "OPEN", cost: { total: "2.3" } });
  });

  it("accept, message, release through MCP; worker messages are flagged when they move contact off ProofMarket", async () => {
    await setFlag(t.db, "tasks_enabled", true, "test");
    const alice = (await onboardWorker(t, "alice")).token;
    const mcp = await connect();
    const call2 = async (name: string, a: Record<string, unknown>) =>
      (await mcp.callTool({ name, arguments: a })) as Any;
    const posted = await call2("create_task", { ...args, dry_run: false, confirm: true });
    const id = posted.structuredContent.task_id as string;
    await call(
      (r) => handleWorkerApply(t.app, r, id),
      jsonReq("POST", `/v1/worker/market-tasks/${id}/apply`, { key: alice, body: {} }),
    );
    const apps = await call2("list_task_applications", { task_id: id });
    const appId = apps.structuredContent.applications[0].application_id as string;
    const accepted = await call2("decide_task_application", {
      task_id: id,
      application_id: appId,
      action: "accept",
    });
    expect(accepted.isError).toBeFalsy();
    const seatId = accepted.structuredContent.seats[0].seat_id as string;
    await tick(t.app);

    await call(
      (r) => handleWorkerSeatMessages(t.app, r, seatId),
      jsonReq("POST", `/v1/worker/market-seats/${seatId}/messages`, {
        key: alice,
        body: { body: "Done soon. You can also reach me at alice@example.com" },
      }),
    );
    const sent = await call2("task_messages", {
      task_id: id,
      seat_id: seatId,
      body: "Thanks, please keep it here.",
    });
    expect(
      sent.structuredContent.messages.map((m: { sender: string; flags: string[] }) => [m.sender, m.flags]),
    ).toEqual([
      ["worker", ["contact_email"]],
      ["requester", []],
    ]);

    await call(
      (r) => handleWorkerDeliver(t.app, r, seatId),
      jsonReq("POST", `/v1/worker/market-seats/${seatId}/deliver`, {
        key: alice,
        body: { body: "No typos found." },
      }),
    );
    const noAck = await call2("decide_task_seat", { task_id: id, seat_id: seatId, action: "release" });
    expect(noAck.isError).toBe(true);
    const released = await call2("decide_task_seat", {
      task_id: id,
      seat_id: seatId,
      action: "release",
      acknowledge_release: true,
    });
    expect(released.structuredContent.seats[0]).toMatchObject({
      state: "RELEASED",
      released_by: "requester",
    });
  });

  it("set_worker_preference blocks an applicant by task_id + worker_ref and lists the mark", async () => {
    await setFlag(t.db, "tasks_enabled", true, "test");
    const worker = (await onboardWorker(t, "wanda")).token;
    const mcp = await connect();
    const created: Any = await mcp.callTool({
      name: "create_task",
      arguments: { ...args, dry_run: false, confirm: true },
    });
    const taskId = created.structuredContent.task_id;
    await call(
      (r) => handleWorkerApply(t.app, r, taskId),
      jsonReq("POST", `/v1/worker/market-tasks/${taskId}/apply`, { key: worker, body: { answers: {} } }),
    );
    const apps: Any = await mcp.callTool({ name: "list_task_applications", arguments: { task_id: taskId } });
    const ref = apps.structuredContent.applications[0].worker_ref;
    const set: Any = await mcp.callTool({
      name: "set_worker_preference",
      arguments: { kind: "block", task_id: taskId, worker_ref: ref },
    });
    expect(set.isError).toBeFalsy();
    expect(set.structuredContent).toMatchObject({ kind: "block" });
    const listed: Any = await mcp.callTool({ name: "set_worker_preference", arguments: {} });
    expect(listed.structuredContent.workers).toEqual([
      expect.objectContaining({ kind: "block", public_id: null }),
    ]);
  });
});
