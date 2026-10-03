// Coarse pilot areas (04 §3.22). Workers pick areas for notifications; tasks map to one by their location.
// No worker location is ever needed: only the task's (public shop) location is mapped.

import { haversineM } from "../verification/checks.ts";
import type { ParticipationArea } from "./enums.ts";

export const PILOT_AREAS = {
  shibuya: { lat: 35.658, lng: 139.7016, radiusM: 2000, label: "渋谷のあたり" },
  shinjuku: { lat: 35.6896, lng: 139.7006, radiusM: 2000, label: "新宿のあたり" },
} as const;

export const AREA_LABELS: Record<ParticipationArea, string> = {
  shibuya: PILOT_AREAS.shibuya.label,
  shinjuku: PILOT_AREAS.shinjuku.label,
  other: "それ以外の東京都心",
};

/** Nearest named area whose radius contains the point, else "other". */
export function areaOf(p: { lat: number; lng: number }): ParticipationArea {
  let best: { a: ParticipationArea; d: number } | null = null;
  for (const [a, c] of Object.entries(PILOT_AREAS) as [
    keyof typeof PILOT_AREAS,
    (typeof PILOT_AREAS)[keyof typeof PILOT_AREAS],
  ][]) {
    const d = haversineM(p, c);
    if (d <= c.radiusM && (!best || d < best.d)) best = { a, d };
  }
  return best?.a ?? "other";
}
