// The public task list (docs/architecture 14 §6): only open tasks for everyone before the deadline, no requester
// identity, 410 once closed, 404 for preferred-only; and the MCP tools that search public profiles.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleCancelTask,
  handleCreateTask,
  handleListApplications,
  handleWorkerApply,
} from "../lib/handlers/market-tasks";
import { handleWorkerPreferences } from "../lib/handlers/prefs";
import { handleWorkerProfile } from "../lib/handlers/profiles";
import { handlePublicMarketTask, handlePublicMarketTasks } from "../lib/handlers/public-market";
import { handleMcp } from "../lib/mcp-http";
import { setFlag } from "../lib/services/admin-service";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;

beforeEach(async () => {
  t = await createTestApp();
  await setFlag(t.db, "tasks_enabled", true, "test");
  alice = (await onboardWorker(t, "alice")).token;
});

// biome-ignore lint/suspicious/noExplicitAny: test convenience
const json = async (res: Response): Promise<any> => res.json();
const H = 3600_000;

const create = async (o: Record<string, unknown> = {}) => {
  const res = await call(
    (r) => handleCreateTask(t.app, r),
    jsonReq("POST", "/v1/tasks", {
      key: t.apiKey,
      idem: crypto.randomUUID(),
      body: {
        title: "Call a shop about opening hours",
        description:
          "Phone the shop and ask whether it opens on the coming public holiday, then report the answer.",
        completion_criteria: "The answer and the time of the call",
        evidence_types: ["text"],
        area: "Shibuya-ku",
        price: { asset: "USDC", amount: "1.5", network: "solana-devnet" },
        seats: 2,
        deadline: "2026-10-10T03:00:00Z",
        application_questions: [{ id: "lang", label: "Can you speak Japanese?", required: true }],
        ...o,
      },
    }),
  );
  expect(res.status).toBe(201);
  return (await json(res)).task_id as string;
};
const list = async () =>
  json(await call((r) => handlePublicMarketTasks(t.app, r), jsonReq("GET", "/v1/public/market-tasks")));
const one = (id: string) =>
  call((r) => handlePublicMarketTask(t.app, r, id), jsonReq("GET", `/v1/public/market-tasks/${id}`));

describe("public task list", () => {
  it("shows open tasks with no requester identity, application questions or seats", async () => {
    const id = await create();
    const page = await list();
    expect(page.tasks.map((x: { task_id: string }) => x.task_id)).toEqual([id]);
    const card = page.tasks[0];
    expect(card).toMatchObject({
      price: { asset: "USDC", amount: "1.5" },
      seats_open: 2,
      area: "Shibuya-ku",
    });
    expect(card.requester).toEqual({ rejected_ratio: null, decided: 0 });
    const text = JSON.stringify(await json(await one(id)));
    for (const secret of [t.credentialId, t.principalId, t.apiKey.slice(0, 12), "Can you speak Japanese"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('seats":[');
  });

  it("drops cancelled and past-deadline tasks (410) and never lists preferred-only ones (404)", async () => {
    const cancelled = await create();
    await call(
      (r) => handleCancelTask(t.app, r, cancelled),
      jsonReq("POST", `/v1/tasks/${cancelled}/cancel`, { key: t.apiKey, body: {} }),
    );
    const res = await one(cancelled);
    expect(res.status).toBe(410);
    expect((await json(res)).error.code).toBe("TASK_EXPIRED");

    // A preferred-only task: the requester first prefers alice, whom it met on another task.
    const met = await create();
    await call(
      (r) => handleWorkerApply(t.app, r, met),
      jsonReq("POST", `/v1/worker/market-tasks/${met}/apply`, {
        key: alice,
        body: { answers: { lang: "yes" } },
      }),
    );
    const { applications } = await json(
      await call(
        (r) => handleListApplications(t.app, r, met),
        jsonReq("GET", `/v1/tasks/${met}/applications`, { key: t.apiKey }),
      ),
    );
    await call(
      (r) => handleWorkerPreferences(t.app, r),
      jsonReq("POST", "/v1/worker-preferences", {
        key: t.apiKey,
        body: { worker: { task_id: met, worker_ref: applications[0].worker_ref }, kind: "prefer" },
      }),
    );
    const only = await create({ audience: "preferred" });
    expect((await one(only)).status).toBe(404);
    expect((await list()).tasks.map((x: { task_id: string }) => x.task_id)).toEqual([met]);

    t.advance(48 * H);
    expect((await list()).tasks).toEqual([]);
    expect((await one(met)).status).toBe(410);
  });

  it("answers 404 TASKS_NOT_ENABLED while tasks are off", async () => {
    await setFlag(t.db, "tasks_enabled", false, "test");
    const res = await call(
      (r) => handlePublicMarketTasks(t.app, r),
      jsonReq("GET", "/v1/public/market-tasks"),
    );
    expect(res.status).toBe(404);
  });

  it("MCP search_workers and get_worker_profile read public profiles", async () => {
    await call(
      (r) => handleWorkerProfile(t.app, r),
      jsonReq("PUT", "/v1/worker/profile", {
        key: alice,
        body: { public: true, display_name: "Aki", skills: ["Phone calls"], languages: ["ja"] },
      }),
    );
    const mcpFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      handleMcp(t.app, new Request(input, init), () => {})) as typeof fetch;
    const mcp = new Client({ name: "agent", version: "1" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL("http://pm.test/mcp"), {
        fetch: mcpFetch,
        requestInit: { headers: { Authorization: `Bearer ${t.apiKey}` } },
      }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    const found: any = await mcp.callTool({ name: "search_workers", arguments: { skill: "phone calls" } });
    expect(found.isError).toBeFalsy();
    const pid = found.structuredContent.workers[0].public_id;
    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    const prof: any = await mcp.callTool({ name: "get_worker_profile", arguments: { public_id: pid } });
    expect(prof.structuredContent).toMatchObject({ display_name: "Aki", languages: ["ja"] });
  });
});
