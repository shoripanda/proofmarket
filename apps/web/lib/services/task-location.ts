// A task's location as the API shows it, or null for work that can be done anywhere (01 §4.15).
import type { schema } from "@proofmarket/db";

type Located = Pick<typeof schema.verificationRequests.$inferSelect, "targetLat" | "targetLng" | "radiusM">;

export function taskLocation(t: Located): { lat: number; lng: number; radius_m: number } | null {
  return t.targetLat !== null && t.targetLng !== null && t.radiusM !== null
    ? { lat: t.targetLat, lng: t.targetLng, radius_m: t.radiusM }
    : null;
}
