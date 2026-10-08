// 01 §4.27: the human-readable summary, one wording per state, in both languages.
import type { GetVerificationResponse } from "@proofmarket/core/schemas/api";
import { describe, expect, it } from "vitest";
import { summarize } from "../lib/services/summary";

type View = Omit<GetVerificationResponse, "summary">;

const base = (over: Partial<Record<keyof View, unknown>>): View =>
  ({
    verification_id: "ver_01TEST",
    type: "PLACE_STATUS_VERIFICATION",
    status: "OPEN",
    question: "Is this shop open right now?",
    answer_schema: { type: "enum", values: ["OPEN", "CLOSED", "UNCLEAR"] },
    deadline: "2026-10-09T04:00:00Z", // 13:00 JST
    assurance: { required_witnesses: 2, quorum: 2, level: "standard", challenge_minutes: null },
    witness_progress: { valid: 0, active_claims: 0, open_slots: 2, required: 2, checking: 0, returned: 0 },
    ...over,
    result: over.result === undefined ? null : over.result,
  }) as unknown as View;

const result = (over: Record<string, unknown>): NonNullable<View["result"]> =>
  ({
    verification_id: "ver_01TEST",
    status: "VERIFIED",
    reason: null,
    answer: "OPEN",
    witnesses: { valid: 2, required: 2, quorum: 2 },
    answer_counts: { OPEN: 2 },
    consensus_ratio: 1,
    settlement: { status: "SETTLED", signature: null, paid: [] },
    proof: { url: "https://proofmarket.fun/r/ver_01TEST", badge_url: "", markdown: "" },
    ...over,
  }) as unknown as NonNullable<View["result"]>;

describe("summarize", () => {
  it("waiting for someone", () => {
    const s = summarize(base({}));
    expect(s.ja).toContain("まだ引き受け手を待っています");
    expect(s.ja).toContain("13:00 JST");
    expect(s.en).toContain("Waiting for someone to take it");
  });

  it("someone is on the way", () => {
    const s = summarize(
      base({
        status: "CLAIMED",
        witness_progress: {
          valid: 0,
          active_claims: 1,
          open_slots: 1,
          required: 2,
          checking: 0,
          returned: 0,
        },
      }),
    );
    expect(s.ja).toBe("1 人が引き受けて向かっています。締め切りは 13:00 JST。");
    expect(s.en).toContain("1 person has taken it and is on the way");
  });

  it("submissions under review and sent back are counted", () => {
    const s = summarize(
      base({
        status: "SUBMITTED",
        witness_progress: {
          valid: 1,
          active_claims: 1,
          open_slots: 0,
          required: 2,
          checking: 1,
          returned: 1,
        },
      }),
    );
    expect(s.ja).toContain("有効な答え 1 / 2 人");
    expect(s.ja).toContain("AI が写真と答えを確かめている提出が 1 件");
    expect(s.ja).toContain("差し戻した提出が 1 件");
    expect(s.en).toContain("1 submission under AI review");
    expect(s.en).toContain("1 sent back");
  });

  it("final answer with the AI review and the proof link", () => {
    const s = summarize(
      base({
        status: "SETTLED",
        result: result({
          reviews: [
            { verdict: "pass", reason: "", observed: "", model: null },
            { verdict: "uncertain", reason: "看板が暗い", observed: "", model: null },
          ],
        }),
      }),
    );
    expect(s.ja).toContain("確定しました。答え: OPEN");
    expect(s.ja).toContain("2 人が確かめ");
    expect(s.ja).toContain("AI の照合: 合格 1 件、判断できず 1 件（看板が暗い）");
    expect(s.ja).toContain("報酬は支払い済み");
    expect(s.ja).toContain("https://proofmarket.fun/r/ver_01TEST");
    expect(s.en).toContain("Final: OPEN");
    expect(s.en).toContain("AI review: 1 passed, 1 uncertain (看板が暗い)");
  });

  it("text answers show the first accepted text, shortened", () => {
    const s = summarize(
      base({
        type: "DOCUMENT_TRANSCRIPTION",
        answer_schema: { type: "text" },
        status: "VERIFIED",
        result: result({
          answer: "abc",
          answers: ["あ".repeat(100)],
          settlement: { status: "PENDING", paid: [] },
        }),
      }),
    );
    expect(s.ja).toContain(`${"あ".repeat(79)}…`);
    expect(s.ja).toContain("支払いを進めています");
  });

  it("rejected: the answers disagreed", () => {
    const s = summarize(
      base({
        status: "REJECTED",
        result: result({
          status: "REJECTED",
          reason: "NO_CONSENSUS",
          answer: null,
          answer_counts: { OPEN: 1, CLOSED: 1 },
        }),
      }),
    );
    expect(s.ja).toContain("答えが割れたため確定できませんでした（OPEN 1 / CLOSED 1）");
    expect(s.en).toContain("did not agree (OPEN 1 / CLOSED 1)");
  });

  it("expired, cancelled", () => {
    expect(summarize(base({ status: "EXPIRED" })).ja).toContain("締め切り（13:00 JST）を過ぎ");
    expect(summarize(base({ status: "CANCELLED" })).en).toBe(
      "Cancelled. The reserved amount returns to your balance.",
    );
  });

  it("a provisional answer names its challenge window", () => {
    const s = summarize(
      base({
        status: "SUBMITTED",
        result: result({
          provisional: true,
          witnesses: { valid: 1, required: 1, quorum: 1 },
          challenge: { minutes: 30, until: "2026-10-09T03:30:00Z", state: "open" },
        }),
      }),
    );
    expect(s.ja).toBe("仮の答え: OPEN（1 人が確認）。12:30 JST まで異議がなければ、そのまま確定します。");
    expect(s.en).toContain("Provisional answer: OPEN");
  });
});
