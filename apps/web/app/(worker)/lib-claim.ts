"use client";
export interface ClaimDetail {
  claim_id: string;
  verification_id: string;
  state: "ACTIVE" | "ACCEPTED" | "REJECTED" | "ABANDONED" | "EXPIRED";
  expires_at: string;
  attempts_remaining: number;
  submissions: {
    submission_id: string;
    state: "VALID" | "INVALID";
    reason_code: string | null;
    reason_message_ja: string | null;
  }[];
  task_result: { status: string; answer: string | null } | null;
  type: string;
  answer_values: string[];
}
