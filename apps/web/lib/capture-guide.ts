// 13 §6: the checklist laid over the camera. The acceptance criteria split into sentences ("。", and ". " or a line
// break for English and lists), first four kept; without criteria, the task type's howTo.
export const GUIDE_MAX_LINES = 4;

export function captureGuide(
  criteria: string | null | undefined,
  howTo: string | null | undefined,
): string[] {
  const lines = (criteria ?? "")
    .split(/。|\n|\.(?:\s+|$)/)
    .map((s) => s.replace(/^[\s・\-*•]+/, "").trim())
    .filter(Boolean)
    .slice(0, GUIDE_MAX_LINES);
  if (lines.length) return lines;
  return howTo?.trim() ? [howTo.trim()] : [];
}
