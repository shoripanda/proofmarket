// English wording for the rejection codes a worker can see (07 §6). The API returns the Japanese text with the
// numbers filled in (reason_message_ja); the English site maps the code instead, so no server change is needed.
import type { Lang } from "./lang";

const REASON_EN: Record<string, string> = {
  EVIDENCE_STALE: "The capture window closed before the photo arrived. Tap “Start capture” again.",
  LOCATION_ACCURACY_TOO_LOW:
    "Location accuracy is not good enough. Wait a moment outdoors with a clear view of the sky, then retake.",
  EVIDENCE_OUTSIDE_GEOFENCE:
    "The photo was taken too far from the place. Move within the requested radius and retake.",
  MEDIA_DECODE_FAILED: "The photo could not be read. Please retake it.",
  EVIDENCE_REPLAYED: "This is the same file as a photo used before. This task has ended.",
  EVIDENCE_NEAR_DUPLICATE: "This photo is almost identical to another submission. This task has ended.",
  EVIDENCE_MISMATCH:
    "The AI review found that the photo or the answer does not match the request. Fix it and send again.",
  NONCE_EXPIRED: "The capture window has closed. Tap “Start capture” again.",
};

/** The rejection reason to show: the server's Japanese text, or the English equivalent of its code. */
export function reasonText(
  lang: Lang,
  s: { reason_code: string | null; reason_message_ja: string | null } | undefined,
): string | null {
  if (!s) return null;
  if (lang === "en") return (s.reason_code && REASON_EN[s.reason_code]) || s.reason_message_ja;
  return s.reason_message_ja;
}
