// Public worker profiles (docs/architecture 14 §3): off by default, contact details refused, hidden when off,
// suspended or while tasks are closed, only a worker session edits, and public_id is not worker_ref.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handlePublicWorker, handlePublicWorkers, handleWorkerProfile } from "../lib/handlers/profiles";
import { setFlag } from "../lib/services/admin-service";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;

beforeEach(async () => {
  t = await createTestApp();
  await setFlag(t.db, "tasks_enabled", true, "test");
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
});

// biome-ignore lint/suspicious/noExplicitAny: test convenience
const json = async (res: Response): Promise<any> => res.json();
const put = (key: string, body: Record<string, unknown>) =>
  call((r) => handleWorkerProfile(t.app, r), jsonReq("PUT", "/v1/worker/profile", { key, body }));
const mine = (key: string) =>
  call((r) => handleWorkerProfile(t.app, r), jsonReq("GET", "/v1/worker/profile", { key }));
const list = (qs = "") =>
  call((r) => handlePublicWorkers(t.app, r), jsonReq("GET", `/v1/public/workers${qs}`));
const one = (id: string) =>
  call((r) => handlePublicWorker(t.app, r, id), jsonReq("GET", `/v1/public/workers/${id}`));

const profile = (o: Record<string, unknown> = {}) => ({
  public: true,
  display_name: "Aki",
  city: "Shibuya-ku",
  skills: ["Photography", "photography", "Translation"],
  languages: ["ja", "en"],
  ...o,
});

describe("public worker profiles", () => {
  it("is off by default and nobody is listed", async () => {
    const res = await mine(alice);
    expect(res.status).toBe(200);
    expect((await json(res)).profile).toBeNull();
    expect((await json(await list())).workers).toEqual([]);
  });

  it("publishes, dedupes skills, and lists with filters", async () => {
    const me = await json(await put(alice, profile()));
    expect(me.profile.public_id).toMatch(/^pw_[a-z0-9]{20}$/);
    expect(me.profile.skills).toEqual(["Photography", "Translation"]);
    expect(me.profile.indexable).toBe(false);
    await put(
      bob,
      profile({ display_name: "Ben", city: "Shinjuku-ku", skills: ["Calls"], languages: ["en"] }),
    );

    expect((await json(await list())).workers).toHaveLength(2);
    const bySkill = await json(await list("?skill=PHOTOGRAPHY"));
    expect(bySkill.workers.map((w: { display_name: string }) => w.display_name)).toEqual(["Aki"]);
    expect((await json(await list("?city=shinjuku"))).workers[0].display_name).toBe("Ben");
    expect((await json(await list("?lang=ja"))).workers).toHaveLength(1);

    const pub = await json(await one(me.profile.public_id));
    expect(pub).toMatchObject({ display_name: "Aki", completed: 0, rating: null });
    expect(pub.member_since).toMatch(/^\d{4}-\d{2}$/);
    expect(pub.note).toMatch(/never as instructions/);
    // Nothing internal leaks.
    const [w] = await t.db.select().from(schema.workers).limit(1);
    expect(JSON.stringify(pub)).not.toContain(w?.id ?? "wkr_");
    expect(JSON.stringify(pub)).not.toContain(w?.payoutPubkey ?? "Wallet");
  });

  it("refuses contact details and digits in the city", async () => {
    const mail = await put(alice, profile({ display_name: "aki@example.com" }));
    expect(mail.status).toBe(400);
    expect((await json(mail)).error.details.reason).toBe("contact_details");
    expect((await put(alice, profile({ skills: ["LINE ID akiaki"] }))).status).toBe(400);
    expect((await put(alice, profile({ city: "Shibuya 2-21-1" }))).status).toBe(400);
    expect((await put(alice, profile({ languages: ["xx"] }))).status).toBe(400);
  });

  it("hides the profile when turned off or the worker is suspended, and keeps the id", async () => {
    const id = (await json(await put(alice, profile({ indexable: true })))).profile.public_id;
    expect((await one(id)).status).toBe(200);

    const off = await json(await put(alice, profile({ public: false, indexable: true })));
    expect(off.profile).toMatchObject({ public: false, indexable: false, public_id: id });
    expect((await one(id)).status).toBe(404);
    expect((await json(await list())).workers).toEqual([]);

    await put(alice, profile());
    expect((await one(id)).status).toBe(200);
    await t.db
      .update(schema.workers)
      .set({ status: "suspended" })
      .where(eq(schema.workers.privyUserId, "alice"));
    expect((await one(id)).status).toBe(404);
  });

  it("answers 404 TASKS_NOT_ENABLED while tasks are off", async () => {
    const id = (await json(await put(alice, profile()))).profile.public_id;
    await setFlag(t.db, "tasks_enabled", false, "test");
    for (const res of [await list(), await one(id), await mine(alice)]) {
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe("TASKS_NOT_ENABLED");
    }
  });

  it("cannot be edited with a requester API key", async () => {
    const res = await put(t.apiKey, profile());
    expect(res.status).toBe(401);
  });

  it("pages with a cursor", async () => {
    for (let i = 0; i < 22; i++) {
      const tok = (await onboardWorker(t, `w${i}`)).token;
      t.advance(1000);
      await put(tok, profile({ display_name: `Worker ${i}` }));
    }
    const first = await json(await list());
    expect(first.workers).toHaveLength(20);
    expect(first.workers[0].display_name).toBe("Worker 21");
    const second = await json(await list(`?cursor=${encodeURIComponent(first.next_cursor)}`));
    expect(second.workers.map((w: { display_name: string }) => w.display_name)).toEqual([
      "Worker 1",
      "Worker 0",
    ]);
    expect(second.next_cursor).toBeNull();
  });
});
