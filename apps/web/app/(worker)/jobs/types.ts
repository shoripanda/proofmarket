// Shapes of the worker endpoints for general tasks (docs/architecture 13 §8). Kept loose: the server is the source.
export interface JobQuestion {
  id: string;
  label: string;
  required: boolean;
}
export interface Job {
  task_id: string;
  status: "OPEN" | "CLOSED" | "DONE" | "CANCELLED";
  title: string;
  description: string;
  completion_criteria: string;
  evidence_types: ("text" | "link" | "photo" | "file")[];
  area: string | null;
  remote_ok: boolean;
  selection_mode: "first_come" | "application";
  release_mode: "manual" | "auto";
  completion_window_hours: number;
  deadline: string;
  application_questions: JobQuestion[];
  price: { asset: string; amount: string };
  seats_open: number;
  requester: { rejected_ratio: number | null; decided: number };
  mine: { application: string | null; seat_id: string | null; seat_state: SeatState | null };
}
export type SeatState = "ASSIGNED" | "IN_REVIEW" | "RELEASED" | "REJECTED" | "EXPIRED" | "CANCELLED";
export interface MySeat {
  seat_id: string;
  task_id: string;
  title: string;
  price: { asset: string; amount: string } | null;
  state: SeatState;
  funded: boolean;
  due_at: string;
  review_due_at: string | null;
  revisions: number;
  released_by: "requester" | "timeout" | "auto" | null;
  decision_reason: string | null;
  delivery: { round: number; body: string; links: string[] } | null;
  /** The requester's rating once paid (docs/architecture 14 §5). Only you see the comment. */
  review: { rating: number; comment: string; created_at: string } | null;
}
