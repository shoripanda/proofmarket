"use client";
import { useEffect, useRef } from "react";
import type { AnswerSchemaView } from "@/lib/answers";
import { type Cue, cue } from "@/lib/client/sound";
import type { AttestationView } from "./attestation-band";
export interface ClaimDetail {
  claim_id: string;
  verification_id: string;
  state: "ACTIVE" | "ACCEPTED" | "REJECTED" | "ABANDONED" | "EXPIRED";
  expires_at: string;
  attempts_remaining: number;
  submissions: {
    submission_id: string;
    state: "VALID" | "INVALID" | "CHECKING";
    reason_code: string | null;
    reason_message_ja: string | null;
  }[];
  task_result: { status: string; answer: string | null } | null;
  type: string;
  question: string;
  acceptance_criteria: string | null;
  attestation: AttestationView | null;
  answer_values: string[];
  answer_schema: AnswerSchemaView;
  location_required: boolean;
}

/**
 * 13 §6: "back" when the latest submission was sent back (INVALID), "result" once the request has its result.
 * Each plays once per visit, including when the screen opens on it or a poll brings it in.
 */
export function useClaimCues(c: ClaimDetail | null) {
  const played = useRef(new Set<Cue>());
  const kind: Cue | null = !c
    ? null
    : c.task_result
      ? "result"
      : c.submissions.at(-1)?.state === "INVALID"
        ? "back"
        : null;
  useEffect(() => {
    if (!kind || played.current.has(kind)) return;
    played.current.add(kind);
    cue(kind);
  }, [kind]);
}
