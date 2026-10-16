import type { Lang } from "@/lib/lang";
import type { SeatState } from "./types";

export const SEAT_TEXT: Record<Lang, Record<SeatState, string>> = {
  ja: {
    ASSIGNED: "作業中",
    IN_REVIEW: "提出済み・確認待ち",
    RELEASED: "支払い済み",
    REJECTED: "受け取られませんでした",
    EXPIRED: "期限切れ",
    CANCELLED: "取り消し",
  },
  en: {
    ASSIGNED: "Working",
    IN_REVIEW: "Delivered, awaiting review",
    RELEASED: "Paid",
    REJECTED: "Not accepted",
    EXPIRED: "Time ran out",
    CANCELLED: "Cancelled",
  },
};
