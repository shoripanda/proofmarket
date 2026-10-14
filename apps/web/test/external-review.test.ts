// Outside AI review (01 §4.17): submissions wait as CHECKING until the operator's reviewer posts a verdict.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleGet } from "../lib/handlers/requester";
import { handleClaimDetail, handleTaskDetail } from "../lib/handlers/worker";
import { setFlag } from "../lib/services/admin-service";
import { applyReview, listPendingReviews } from "../lib/services/evidence-service";
import { tick } from "../lib/services/jobs";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
  await setFlag(t.db, "external_review_enabled", true, "test");
});

interface View {
  status: string;
  result: { checks: Record<string, string>; reviews?: unknown[] };
}
const view = async (id: string) =>
  (await (
    await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
  ).json()) as View;

const transcription = () =>
  openTask(t, {
    type: "DOCUMENT_TRANSCRIPTION",
    question: "本の書名と、どこかのページの最初の1文を書き起こしてください",
    answer_schema: { type: "text" },
    location: undefined,
  });

describe("outside AI review", () => {
  it("holds the submission, sends a miss back with its reason, then verifies after a passing review", async () => {
    const id = await transcription();
    const first = await witness(t, alice, id, { answer: "会社の作り方の本。" });
    expect(first.body).toMatchObject({ state: "CHECKING", claim_state: "ACTIVE", retryable: false });
    expect((await view(id)).status).not.toBe("VERIFIED");

    // a second submission on the same claim waits for the first review
    const again = await witness(t, alice, id, { claimId: first.claimId, answer: "x" });
    expect(again.res.status).toBe(409);
    expect(((await again.res.json()) as { error: { code: string } }).error.code).toBe("REVIEW_PENDING");

    const { reviews } = await listPendingReviews(t.app);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      verification_id: id,
      answer: "会社の作り方の本。",
      type: "DOCUMENT_TRANSCRIPTION",
    });
    expect(reviews[0]?.image_url).toMatch(/^https:\/\//);

    const missed = await applyReview(t.app, first.body.submission_id as string, {
      verdict: "fail",
      reason: "書名と1文が書かれていません。",
      observed: "本のページ",
      model: "claude-code",
    });
    expect(missed).toMatchObject({ state: "INVALID", applied: true });
    const detail = (await (
      await call(
        (r) => handleClaimDetail(t.app, r, first.claimId),
        jsonReq("GET", `/v1/worker/claims/${first.claimId}`, { key: alice }),
      )
    ).json()) as {
      state: string;
      submissions: { state: string; reason_message_ja: string }[];
    };
    expect(detail.state).toBe("ACTIVE");
    expect(detail.submissions[0]?.reason_message_ja).toContain("書名と1文が書かれていません。");
    await expect(
      applyReview(t.app, first.body.submission_id as string, {
        verdict: "pass",
        reason: "x",
        observed: "",
        model: "m",
      }),
    ).rejects.toMatchObject({ code: "SUBMISSION_NOT_PENDING" });

    const second = await witness(t, alice, id, {
      claimId: first.claimId,
      answer: "『起業の教科書』 株式会社は一人でも作れる。",
    });
    expect(second.body.state).toBe("CHECKING");
    await applyReview(t.app, second.body.submission_id as string, {
      verdict: "pass",
      reason: "書名と1文がそろっています。",
      observed: "本のページ",
      model: "claude-opus-5-5",
    });
    const v = await view(id);
    expect(v.status).toBe("VERIFIED");
    expect(v.result.checks.vision_consistency).toBe("pass");
    expect(v.result.reviews).toEqual([
      {
        verdict: "pass",
        reason: "書名と1文がそろっています。",
        observed: "本のページ",
        model: "claude-opus-5-5",
      },
    ]);
  });

  it("a pending review keeps the claim past its TTL, and a reviewer's late verdict still counts", async () => {
    const id = await transcription();
    const first = await witness(t, alice, id, { answer: "書き起こし" });
    t.advance(29 * 60_000); // past the claim TTL is not the point here; the review is still awaited
    await tick(t.app);
    const [claim] = await t.db.select().from(schema.claims).where(eq(schema.claims.id, first.claimId));
    expect(claim?.state).toBe("ACTIVE");
    await applyReview(t.app, first.body.submission_id as string, {
      verdict: "uncertain",
      reason: "文字が小さく読み切れません。",
      observed: "本のページ",
      model: "claude-code",
    });
    const v = await view(id);
    expect(v.status).toBe("VERIFIED");
    expect(v.result.checks.vision_consistency).toBe("warning");
  });

  it("01 §4.17: when no verdict arrives within 30 minutes the submission passes with a warning, not an expiry", async () => {
    const id = await transcription();
    const first = await witness(t, alice, id, { answer: "書き起こし" });
    t.advance(31 * 60_000);
    await tick(t.app);
    const v = await view(id);
    expect(v.status).toBe("VERIFIED");
    expect(v.result.checks.vision_consistency).toBe("warning");
    expect(v.result.reviews).toEqual([expect.objectContaining({ verdict: "unavailable", model: "none" })]);
    // the late verdict is refused: the submission is no longer pending
    await expect(
      applyReview(t.app, first.body.submission_id as string, {
        verdict: "pass",
        reason: "",
        observed: "",
        model: "m",
      }),
    ).rejects.toMatchObject({ code: "SUBMISSION_NOT_PENDING" });
  });

  it("with the flag off nothing is held", async () => {
    await setFlag(t.db, "external_review_enabled", false, "test");
    const id = await transcription();
    expect((await witness(t, alice, id, { answer: "書き起こし" })).body.state).toBe("VALID");
    expect((await listPendingReviews(t.app)).reviews).toEqual([]);
  });
});

describe("operator review by reward (docs/architecture 07 §4.2, 01 §4.30)", () => {
  const big = () =>
    openTask(t, {
      type: "DOCUMENT_TRANSCRIPTION",
      question: "本の書名と、どこかのページの最初の1文を書き起こしてください",
      answer_schema: { type: "text" },
      location: undefined,
      bounty: { asset: "USDC", amount: "5", network: "solana-devnet" },
    }); // total 5 (one witness)
  const detail = async (id: string) =>
    (await (
      await call(
        (r) => handleTaskDetail(t.app, r, id),
        jsonReq("GET", `/v1/worker/tasks/${id}`, { key: alice }),
      )
    ).json()) as { operator_review: boolean };

  it("at or above the threshold: held with the flag off, not released at 30 minutes, paid after the operator's pass", async () => {
    await setFlag(t.db, "external_review_enabled", false, "test");
    t.app.config.humanReviewMin = { USDC: 5_000_000n };
    const id = await big();
    expect((await detail(id)).operator_review).toBe(true);
    const first = await witness(t, alice, id, { answer: "会社の作り方の本。" });
    expect(first.body).toMatchObject({ state: "CHECKING", claim_state: "ACTIVE" });
    // the 30-minute release does not apply
    t.advance(31 * 60_000);
    await tick(t.app);
    expect((await listPendingReviews(t.app)).reviews).toHaveLength(1);
    expect((await view(id)).status).not.toBe("VERIFIED");
    // the operator's verdict pays it, and the record says who judged
    await applyReview(t.app, first.body.submission_id as string, {
      verdict: "pass",
      reason: "依頼どおりです",
      observed: "書名が写っている",
      model: "claude-code",
    });
    expect((await view(id)).status).toBe("VERIFIED");
    const [check] = await t.db
      .select()
      .from(schema.evidenceChecks)
      .where(eq(schema.evidenceChecks.checkType, "vision_consistency"));
    expect(check?.machineDetails).toMatchObject({ reviewer: "operator-mac", model: "claude-code" });
  });

  it("below the threshold nothing changes: not held with the flag off, operator_review false", async () => {
    await setFlag(t.db, "external_review_enabled", false, "test");
    t.app.config.humanReviewMin = { USDC: 5_000_000n };
    const id = await transcription(); // total 0.5
    expect((await detail(id)).operator_review).toBe(false);
    expect((await witness(t, alice, id, { answer: "書き起こし" })).body.state).toBe("VALID");
  });

  it("a timeout release records reviewer=timeout", async () => {
    const id = await transcription();
    await witness(t, alice, id, { answer: "書き起こし" });
    t.advance(31 * 60_000);
    await tick(t.app);
    const [check] = await t.db
      .select()
      .from(schema.evidenceChecks)
      .where(eq(schema.evidenceChecks.checkType, "vision_consistency"));
    expect(check?.machineDetails).toMatchObject({ reviewer: "timeout", verdict: "unavailable" });
  });
});
