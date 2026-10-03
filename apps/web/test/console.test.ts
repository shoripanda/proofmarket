// Requester console (01 §4.14): key -> httpOnly session, same-origin POSTs, suspension and expiry end access.
import { beforeEach, describe, expect, it } from "vitest";
import { authenticateApiKey } from "../lib/auth/requester";
import { handleConsoleLogin, handleConsoleStopSchedule } from "../lib/handlers/console";
import { suspendCredential } from "../lib/services/admin-service";
import { consoleAuth, dashboard } from "../lib/services/console-service";
import { createSchedule } from "../lib/services/schedule-service";
import { call, createBody, createTestApp } from "./support/app";
import { openTask } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});
const post = (path: string, o: { body?: unknown; origin?: string | null; cookie?: string } = {}) =>
  new Request(`http://localhost:3917${path}`, {
    method: "POST",
    headers: {
      host: "localhost:3917",
      "content-type": "application/json",
      ...(o.origin === null ? {} : { origin: o.origin ?? "http://localhost:3917" }),
      ...(o.cookie ? { cookie: o.cookie } : {}),
    },
    body: JSON.stringify(o.body ?? {}),
  });
const login = async (origin?: string | null) => {
  const res = await call(
    (r) => handleConsoleLogin(t.app, r),
    post("/v1/console/session", { body: { api_key: t.apiKey }, origin }),
  );
  const cookie = res.headers.get("set-cookie") ?? "";
  return { res, cookie, token: /pm_console=([^;]+)/.exec(cookie)?.[1] };
};

describe("requester console", () => {
  it("exchanges the key for an httpOnly, SameSite=Strict session; the key is not in the cookie", async () => {
    const { res, cookie, token } = await login();
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toContain(t.apiKey);
    expect((await consoleAuth(t.app, token))?.credentialId).toBe(t.credentialId);
  });

  it("refuses other origins and missing Origin, and bad keys", async () => {
    expect((await login("https://evil.example")).res.status).toBe(403);
    expect((await login(null)).res.status).toBe(403);
    const bad = await call(
      (r) => handleConsoleLogin(t.app, r),
      post("/v1/console/session", { body: { api_key: "pm_test_00000000_x" } }),
    );
    expect(bad.status).toBe(401);
  });

  it("ends when the key is suspended or after 12 hours", async () => {
    const { token } = await login();
    t.advance(11 * 3600_000);
    expect(await consoleAuth(t.app, token)).not.toBeNull();
    t.advance(2 * 3600_000);
    expect(await consoleAuth(t.app, token)).toBeNull();
    const again = (await login()).token;
    await suspendCredential(t.db, t.credentialId, "test");
    expect(await consoleAuth(t.app, again)).toBeNull();
  });

  it("shows balance, today's spend and tasks, and can stop a schedule (same origin only)", async () => {
    const id = await openTask(t);
    const auth = await authenticateApiKey(t.app, t.apiKey);
    const d = await dashboard(t.app, auth);
    expect(d).toMatchObject({ balance: "9.5", spent_today: "0.5", key: { max_task_amount: "5" } });
    expect(d.tasks.map((x) => x.verification_id)).toEqual([id]);
    const { deadline: _d, ...request } = createBody(t.principalId);
    const s = await createSchedule(t.app, auth, {
      request,
      deadline_minutes: 30,
      times_jst: ["12:30"],
      days_jst: [5],
    });
    const { cookie } = await login();
    const c = cookie.split(";")[0] ?? "";
    const cross = await call(
      (r) => handleConsoleStopSchedule(t.app, r, s.schedule_id),
      post("/x", { cookie: c, origin: "https://evil.example" }),
    );
    expect(cross.status).toBe(403);
    const ok = await call(
      (r) => handleConsoleStopSchedule(t.app, r, s.schedule_id),
      post("/x", { cookie: c }),
    );
    expect(((await ok.json()) as { active: boolean }).active).toBe(false);
  });
});
