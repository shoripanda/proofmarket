"use client";
import type { AnswerSchemaView } from "@/lib/answers";
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
  answer_values: string[];
  answer_schema: AnswerSchemaView;
  location_required: boolean;
}
