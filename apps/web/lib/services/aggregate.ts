// Sense index (13 §4): numbers summarised across witnesses. Computed when the result is saved (it is part of
// result_hash) and again when the result is read, from the same accepted answers.
import { answerSchemaOf, sensesOfFields } from "@proofmarket/core";
import type { VerificationResult } from "@proofmarket/core/schemas/api";
import type { TaskRow } from "./task-engine";

/**
 * Sense index (13 §4): median, min and max of each number or scale field of a form, once 3 or more accepted
 * answers are in. The median of an even count is the lower middle value, so a scale stays a whole number.
 */
export function aggregateOf(
  task: Pick<TaskRow, "answerKind" | "answerValues" | "answerSpec">,
  answers: readonly string[],
): Pick<VerificationResult, "aggregate"> {
  const spec = answerSchemaOf(
    task.answerKind,
    task.answerValues,
    task.answerSpec as Record<string, unknown> | null,
  );
  if (spec.type !== "form" || answers.length < 3) return {};
  const parsed = answers.map((a) => {
    try {
      return JSON.parse(a) as Record<string, unknown>;
    } catch {
      return {};
    }
  });
  const out: NonNullable<VerificationResult["aggregate"]> = {};
  const sensory = sensesOfFields(spec.fields) !== null;
  for (const f of spec.fields) {
    // docs/architecture 16 §7: the share of answers choosing each word, over the answers that filled the field.
    if (f.type === "tags") {
      const picked = parsed.map((p) => p[f.key]).filter((v): v is string[] => Array.isArray(v));
      if (picked.length < 3) continue;
      const shares: Record<string, number> = {};
      for (const word of f.values) {
        const k = picked.filter((v) => v.includes(word)).length;
        if (k > 0) shares[word] = Math.round((k / picked.length) * 1000) / 1000;
      }
      out[f.key] = { shares, n: picked.length };
      continue;
    }
    // 16 §7: for a sensory report, how many reported each sense, found nothing, or declined.
    if (sensory && f.type === "enum" && f.key.endsWith("_status")) {
      const counts = Object.fromEntries(f.values.map((v) => [v, 0])) as Record<string, number>;
      for (const p of parsed) {
        const v = p[f.key];
        if (typeof v === "string" && v in counts) counts[v] = (counts[v] ?? 0) + 1;
      }
      out[f.key] = { counts, n: parsed.length };
      continue;
    }
    if (f.type !== "number" && f.type !== "scale") continue;
    const xs = parsed
      .map((p) => p[f.key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (xs.length < 3) continue;
    out[f.key] = {
      median: xs[Math.floor((xs.length - 1) / 2)] as number,
      min: xs[0] as number,
      max: xs[xs.length - 1] as number,
      n: xs.length,
    };
  }
  return Object.keys(out).length ? { aggregate: out } : {};
}
