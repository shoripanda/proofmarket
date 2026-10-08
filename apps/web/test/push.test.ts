// Push notifications for new tasks (04 §3.22): areas instead of location, allowed push hosts, gone endpoints.
import { areaOf } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { beforeEach, describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, runNotifyWorkers, savePushSubscription } from "../lib/services/push-service";
import { createTestApp } from "./support/app";
import { onboardWorker, openTask } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
beforeEach(async () => {
  t = await createTestApp();
  await onboardWorker(t, "alice");
  await onboardWorker(t, "bob");
  const ws = await t.db.select().from(schema.workers);
  alice = ws.find((w) => w.privyUserId === "alice")?.id ?? "";
  bob = ws.find((w) => w.privyUserId === "bob")?.id ?? "";
});
const sub = (n: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  keys: { p256dh: "BPk", auth: "au" },
});
const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe("push notifications", () => {
  it("maps locations to coarse areas", () => {
    expect(areaOf({ lat: 35.6595, lng: 139.7005 })).toBe("shibuya");
    expect(areaOf({ lat: 35.69, lng: 139.7 })).toBe("shinjuku");
    expect(areaOf({ lat: 35.68, lng: 139.77 })).toBe("other");
  });

  it("only accepts endpoints of known push services (no SSRF targets)", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });

  it("opening a task notifies only workers who chose its area, once, with no question text", async () => {
    await savePushSubscription(t.app, alice, { subscription: sub("a"), areas: ["shibuya"] });
    await savePushSubscription(t.app, bob, { subscription: sub("b"), areas: ["shinjuku"] });
    const id = await openTask(t); // the test shop is in Shibuya
    const jobs = (await t.db.select().from(schema.outboxJobs)).map((j) => j.dedupeKey);
    expect(jobs).toContain(`NOTIFY_WORKERS:${id}`);
    expect(await runNotifyWorkers(t.app, id)).toEqual({ sent: 1 });
    expect(t.push.sent.map((s) => s.endpoint)).toEqual([sub("a").endpoint]);
    const payload = JSON.parse(t.push.sent[0]?.payload ?? "{}");
    expect(payload).toMatchObject({ url: `/tasks/${id}` });
    expect(JSON.stringify(payload)).not.toMatch(/Is this shop open/);
  });

  it("writes the notification in the language the worker's app is shown in (13 §7)", async () => {
    await savePushSubscription(t.app, alice, { subscription: sub("a"), areas: ["shibuya"], lang: "en" });
    await savePushSubscription(t.app, bob, { subscription: sub("b"), areas: ["shibuya"] });
    const id = await openTask(t);
    expect(await runNotifyWorkers(t.app, id)).toEqual({ sent: 2 });
    const byEndpoint = Object.fromEntries(t.push.sent.map((s) => [s.endpoint, JSON.parse(s.payload)]));
    expect(byEndpoint[sub("a").endpoint]).toMatchObject({
      title: "New request nearby",
      url: `/en/tasks/${id}`,
    });
    expect(byEndpoint[sub("a").endpoint].body).toMatch(/around Shibuya/);
    expect(byEndpoint[sub("b").endpoint]).toMatchObject({ title: "近くで新しい依頼", url: `/tasks/${id}` });
  });

  it("01 §4.20: a worker with no area only hears about work that needs no place", async () => {
    await savePushSubscription(t.app, alice, { subscription: sub("a"), areas: [] });
    await savePushSubscription(t.app, bob, { subscription: sub("b"), areas: ["shibuya"] });
    expect(await runNotifyWorkers(t.app, await openTask(t))).toEqual({ sent: 1 });
    expect(t.push.sent.map((s) => s.endpoint)).toEqual([sub("b").endpoint]);
    t.push.sent.length = 0;
    const home = await openTask(t, {
      type: "DOCUMENT_TRANSCRIPTION",
      question: "手元の本の最初の1行を書き写してください",
      answer_schema: { type: "text" },
      location: undefined,
    });
    expect(await runNotifyWorkers(t.app, home)).toEqual({ sent: 2 });
    expect(t.push.sent.map((s) => s.endpoint).sort()).toEqual([sub("a").endpoint, sub("b").endpoint]);
  });

  it("stores endpoints encrypted, re-registering overwrites, and gone endpoints are deleted", async () => {
    await savePushSubscription(t.app, alice, { subscription: sub("a"), areas: ["shibuya"] });
    await savePushSubscription(t.app, alice, { subscription: sub("a"), areas: ["shibuya", "other"] });
    const rows = await t.db.select().from(schema.pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.areas).toEqual(["shibuya", "other"]);
    expect(rows[0]?.endpointEnc.toString("utf8")).not.toContain("fcm.googleapis.com");
    t.push.gone.add(sub("a").endpoint);
    await runNotifyWorkers(t.app, await openTask(t));
    expect(await t.db.select().from(schema.pushSubscriptions)).toEqual([]);
  });

  it("validates input and is unavailable without VAPID keys", async () => {
    expect(
      await err(
        savePushSubscription(t.app, alice, { subscription: sub("a"), areas: ["shibuya", "shibuya"] }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(
      await err(
        savePushSubscription(t.app, alice, {
          subscription: { ...sub("a"), endpoint: "https://evil.example/x" },
          areas: ["shibuya"],
        }),
      ),
    ).toBe("VALIDATION_FAILED");
    expect(
      await err(
        savePushSubscription({ ...t.app, push: null }, alice, { subscription: sub("a"), areas: ["other"] }),
      ),
    ).toBe("FEATURE_DISABLED");
  });
});
