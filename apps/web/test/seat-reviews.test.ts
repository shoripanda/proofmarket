// Ratings (docs/architecture 14 §5): only a RELEASED seat, by the task's owner, once, within 14 days; the comment
// reaches the worker only; the public profile shows the average from 3 ratings.
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleCreateTask,
  handleDecideSeat,
  handleWorkerApply,
  handleWorkerDeliver,
  handleWorkerListSeats,
} from "../lib/handlers/market-tasks";
import { handlePublicWorker, handleWorkerProfile } from "../lib/handlers/profiles";
import { setFlag } from "../lib/services/admin-service";
import { tick } from "../lib/services/jobs";
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

const create = async () => {
  const res = await call(
    (r) => handleCreateTask(t.app, r),
    jsonReq("POST", "/v1/tasks", {
      key: t.apiKey,
      idem: crypto.randomUUID(),
      body: {
        title: "Check a web form works",
        description:
          "Fill in the contact form on our test site and tell us whether the thank-you page shows.",
        completion_criteria: "Say whether the thank-you page appeared",
        evidence_types: ["text"],
        remote_ok: true,
        price: { asset: "USDC", amount: "1", network: "solana-devnet" },
        selection_mode: "first_come",
        deadline: "2026-10-12T03:00:00Z",
      },
    }),
  );
  expect(res.status).toBe(201);
  return (await json(res)).task_id as string;
};
const seatAction = (id: string, seatId: string, action: string, body: unknown = {}) =>
  call(
    (r) => handleDecideSeat(t.app, r, id, seatId, action),
    jsonReq("POST", `/v1/tasks/${id}/seats/${seatId}/${action}`, { key: t.apiKey, body }),
  );
const mySeats = async () =>
  (
    await json(
      await call(
        (r) => handleWorkerListSeats(t.app, r),
        jsonReq("GET", "/v1/worker/market-seats", { key: alice }),
      ),
    )
  ).seats;

/** Alice takes a first-come seat, delivers, and it is released. */
async function releasedSeat(): Promise<{ id: string; seatId: string }> {
  const id = await create();
  await call(
    (r) => handleWorkerApply(t.app, r, id),
    jsonReq("POST", `/v1/worker/market-tasks/${id}/apply`, { key: alice, body: { answers: {} } }),
  );
  await tick(t.app); // FUND_SEAT
  const seatId = (await mySeats()).find((s: { task_id: string }) => s.task_id === id).seat_id as string;
  await call(
    (r) => handleWorkerDeliver(t.app, r, seatId),
    jsonReq("POST", `/v1/worker/market-seats/${seatId}/deliver`, {
      key: alice,
      body: { body: "It showed." },
    }),
  );
  expect((await seatAction(id, seatId, "release", { acknowledge_release: true })).status).toBe(200);
  await tick(t.app); // SETTLE_SEAT
  return { id, seatId };
}

describe("ratings", () => {
  it("rates a released seat once; the worker sees the comment", async () => {
    const { id, seatId } = await releasedSeat();
    const res = await seatAction(id, seatId, "review", { rating: 4, comment: "Quick and clear." });
    expect(res.status).toBe(200);
    expect((await json(res)).review).toMatchObject({ rating: 4, comment: "Quick and clear." });

    const again = await seatAction(id, seatId, "review", { rating: 5 });
    expect(again.status).toBe(409);
    expect((await json(again)).error.details.reason).toBe("already_reviewed");

    const seat = (await mySeats()).find((s: { seat_id: string }) => s.seat_id === seatId);
    expect(seat.review).toMatchObject({ rating: 4, comment: "Quick and clear." });
    const mine = await json(
      await call((r) => handleWorkerProfile(t.app, r), jsonReq("GET", "/v1/worker/profile", { key: alice })),
    );
    expect(mine.reviews).toEqual([
      expect.objectContaining({ rating: 4, task_title: "Check a web form works" }),
    ]);
    // One rating is not enough to show an average.
    expect(mine.rating).toBeNull();
  });

  it("refuses a seat that is not released, a rating out of range, and after 14 days", async () => {
    const id = await create();
    await call(
      (r) => handleWorkerApply(t.app, r, id),
      jsonReq("POST", `/v1/worker/market-tasks/${id}/apply`, { key: alice, body: { answers: {} } }),
    );
    const seatId = (await mySeats())[0].seat_id as string;
    const early = await seatAction(id, seatId, "review", { rating: 5 });
    expect(early.status).toBe(409);
    expect((await json(early)).error.details.reason).toBe("only_released_seats");

    const done = await releasedSeat();
    expect((await seatAction(done.id, done.seatId, "review", { rating: 6 })).status).toBe(400);
    t.advance(15 * 24 * H);
    const late = await seatAction(done.id, done.seatId, "review", { rating: 5 });
    expect(late.status).toBe(409);
    expect((await json(late)).error.details.reason).toBe("review_window_closed");
  });

  it("shows the average on the public profile from 3 ratings, never the comments", async () => {
    const prof = await json(
      await call(
        (r) => handleWorkerProfile(t.app, r),
        jsonReq("PUT", "/v1/worker/profile", { key: alice, body: { public: true, display_name: "Aki" } }),
      ),
    );
    const pid = prof.profile.public_id as string;
    const view = async () =>
      json(await call((r) => handlePublicWorker(t.app, r, pid), jsonReq("GET", `/v1/public/workers/${pid}`)));
    for (const [i, rating] of [5, 4].entries()) {
      const s = await releasedSeat();
      await seatAction(s.id, s.seatId, "review", { rating, comment: `secret note ${i}` });
    }
    expect((await view()).rating).toBeNull();
    const s = await releasedSeat();
    await seatAction(s.id, s.seatId, "review", { rating: 4, comment: "mail me at a@example.com" });
    const pub = await view();
    expect(pub.rating).toEqual({ average: 4.3, count: 3 });
    expect(pub.completed).toBe(3);
    expect(JSON.stringify(pub)).not.toContain("secret note");
  });
});
