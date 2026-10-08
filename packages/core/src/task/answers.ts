// Answer kinds per task type (01 §4.15): what a requester may ask for and what a worker may send back.
// Form answers (01 §4.25) are several named fields in one JSON object; they are stored as text.
import { type AnswerKind, TASK_TYPE_SPECS, type TaskType, type TaskTypeSpec } from "../domain/enums.ts";
import { LIMITS } from "../domain/limits.ts";
import { ApiError } from "../errors.ts";
import type { AnswerSchemaSpec, FormField } from "../schemas/api.ts";

export const answerKindOf = (type: TaskType): AnswerKind => TASK_TYPE_SPECS[type].answer;
export const locationRequired = (type: TaskType): boolean => TASK_TYPE_SPECS[type].location === "required";

/** The answer_kind column for a schema: a form is kept as text (01 §4.25). */
export const storedAnswerKind = (spec: AnswerSchemaSpec): AnswerKind =>
  spec.type === "form" ? "text" : spec.type;

/** The answer_spec column for a schema: everything but `type`; null for a plain enum. */
export function storedAnswerSpec(spec: AnswerSchemaSpec): Record<string, unknown> | null {
  if (spec.type === "enum") return null;
  const { type: _t, ...rest } = spec;
  return rest;
}

/** Throws VALIDATION_FAILED unless the schema fits the type (kind, and fixed values where the type has them). */
export function validateAnswerSchema(type: TaskType, spec: AnswerSchemaSpec): void {
  const want = answerKindOf(type);
  if (storedAnswerKind(spec) !== want) {
    throw new ApiError("VALIDATION_FAILED", {
      field: "answer_schema.type",
      reason: "not_for_type",
      allowed: want === "text" ? ["text", "form"] : [want],
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
  if (spec.type === "form") {
    const keys = spec.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      throw new ApiError("VALIDATION_FAILED", { field: "answer_schema.fields", reason: "duplicate_keys" });
    }
    for (const [i, f] of spec.fields.entries()) {
      if (f.type === "enum" && new Set(f.values).size !== f.values.length) {
        throw new ApiError("VALIDATION_FAILED", {
          field: `answer_schema.fields.${i}.values`,
          reason: "duplicates",
        });
      }
      if (f.type === "number" && f.min !== undefined && f.max !== undefined && f.min > f.max) {
        throw new ApiError("VALIDATION_FAILED", {
          field: `answer_schema.fields.${i}`,
          reason: "min_greater_than_max",
        });
      }
    }
  }
}

/** A field as a stand-alone answer schema, for normalizing its value. */
function fieldSpec(f: FormField): AnswerSchemaSpec {
  if (f.type === "enum") return { type: "enum", values: f.values };
  if (f.type === "number") return { type: "number", unit: f.unit, min: f.min, max: f.max };
  return { type: "text", max_chars: f.max_chars };
}

/**
 * Normalized form answer (01 §4.25): a JSON object with the fields in schema order, or null when the raw
 * answer is not an object, names an unknown field, misses a required one, or a value does not fit its field.
 */
function normalizeForm(fields: readonly FormField[], raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const given = parsed as Record<string, unknown>;
  const known = new Set(fields.map((f) => f.key));
  if (Object.keys(given).some((k) => !known.has(k))) return null;
  const out: Record<string, string | number> = {};
  for (const f of fields) {
    const v = given[f.key];
    const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (empty) {
      if (f.required) return null;
      continue;
    }
    if (typeof v !== "string" && typeof v !== "number") return null;
    const n = normalizeAnswer(fieldSpec(f), String(v));
    if (n === null) return null;
    out[f.key] = f.type === "number" ? Number(n) : n;
  }
  return JSON.stringify(out);
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
  if (spec.type === "form") return normalizeForm(spec.fields, raw);
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
  if (kind === "text") {
    if (spec && Array.isArray(spec.fields)) return { type: "form", fields: spec.fields } as AnswerSchemaSpec;
    return { type: "text", ...(spec ?? {}) } as AnswerSchemaSpec;
  }
  return { type: "enum", values: [...values] };
}
