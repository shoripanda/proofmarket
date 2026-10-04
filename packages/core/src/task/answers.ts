// Answer kinds per task type (01 §4.15): what a requester may ask for and what a worker may send back.
import { type AnswerKind, TASK_TYPE_SPECS, type TaskType, type TaskTypeSpec } from "../domain/enums.ts";
import { LIMITS } from "../domain/limits.ts";
import { ApiError } from "../errors.ts";
import type { AnswerSchemaSpec } from "../schemas/api.ts";

export const answerKindOf = (type: TaskType): AnswerKind => TASK_TYPE_SPECS[type].answer;
export const locationRequired = (type: TaskType): boolean => TASK_TYPE_SPECS[type].location === "required";

/** Throws VALIDATION_FAILED unless the schema fits the type (kind, and fixed values where the type has them). */
export function validateAnswerSchema(type: TaskType, spec: AnswerSchemaSpec): void {
  const want = answerKindOf(type);
  if (spec.type !== want) {
    throw new ApiError("VALIDATION_FAILED", {
      field: "answer_schema.type",
      reason: "not_for_type",
      allowed: [want],
    });
  }
  if (spec.type === "enum") {
    if (new Set(spec.values).size !== spec.values.length) {
      throw new ApiError("VALIDATION_FAILED", { field: "answer_schema.values", reason: "duplicates" });
    }
    const fixed = (TASK_TYPE_SPECS[type] as TaskTypeSpec).values ?? null;
    if (fixed && !spec.values.every((v) => fixed.includes(v))) {
      throw new ApiError("VALIDATION_FAILED", {
        field: "answer_schema.values",
        reason: "not_for_type",
        allowed: fixed,
      });
    }
  }
  if (spec.type === "number" && spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) {
    throw new ApiError("VALIDATION_FAILED", { field: "answer_schema", reason: "min_greater_than_max" });
  }
}

/** Normalized answer to store, or null when it does not fit the schema. Numbers are kept in canonical form. */
export function normalizeAnswer(spec: AnswerSchemaSpec, raw: string): string | null {
  if (spec.type === "enum") return spec.values.includes(raw) ? raw : null;
  if (spec.type === "number") {
    const t = raw.trim().replaceAll(",", "");
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    if (spec.min !== undefined && n < spec.min) return null;
    if (spec.max !== undefined && n > spec.max) return null;
    return String(n);
  }
  const t = raw.trim();
  const max = spec.max_chars ?? LIMITS.answer.maxTextChars;
  return t.length > 0 && t.length <= max ? t : null;
}

/** Rebuild the API answer_schema from stored columns. */
export function answerSchemaOf(
  kind: string,
  values: readonly string[],
  spec: Record<string, unknown> | null,
): AnswerSchemaSpec {
  if (kind === "number") return { type: "number", ...(spec ?? {}) } as AnswerSchemaSpec;
  if (kind === "text") return { type: "text", ...(spec ?? {}) } as AnswerSchemaSpec;
  return { type: "enum", values: [...values] };
}
