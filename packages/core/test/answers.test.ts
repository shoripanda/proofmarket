// 01 §4.25 — form answers: schema validation, normalization to one JSON object, and rebuilding from storage.
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/errors.ts";
import type { AnswerSchemaSpec } from "../src/schemas/api.ts";
import {
  answerSchemaOf,
  normalizeAnswer,
  storedAnswerKind,
  storedAnswerSpec,
  validateAnswerSchema,
} from "../src/task/answers.ts";

const FORM: AnswerSchemaSpec = {
  type: "form",
  fields: [
    { type: "enum", key: "open", label: "Open?", values: ["OPEN", "CLOSED"], required: true },
    { type: "number", key: "price", label: "Price", unit: "JPY", min: 0, required: true },
    { type: "text", key: "note", label: "Anything else", max_chars: 200, required: false },
  ],
};

describe("form answers (01 §4.25)", () => {
  it("is allowed for text types and refused for choice and number types", () => {
    expect(() => validateAnswerSchema("CUSTOM_TASK", FORM)).not.toThrow();
    expect(() => validateAnswerSchema("SITE_REPORT", FORM)).not.toThrow();
    for (const type of ["PRICE_CHECK", "PLACE_STATUS_VERIFICATION", "CUSTOM_CHOICE"] as const) {
      let err: unknown;
      try {
        validateAnswerSchema(type, FORM);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).details).toMatchObject({
        field: "answer_schema.type",
        reason: "not_for_type",
      });
    }
  });

  it("rejects duplicate keys, duplicate choices and min > max inside a field", () => {
    const dup = { ...FORM, fields: [FORM.fields[0], { ...FORM.fields[1], key: "open" }] } as AnswerSchemaSpec;
    expect(() => validateAnswerSchema("CUSTOM_TASK", dup)).toThrow(ApiError);
    const dupValues = {
      ...FORM,
      fields: [{ type: "enum", key: "a", label: "A", values: ["X", "X"], required: true }],
    } as AnswerSchemaSpec;
    expect(() => validateAnswerSchema("CUSTOM_TASK", dupValues)).toThrow(ApiError);
    const minMax = {
      ...FORM,
      fields: [{ type: "number", key: "n", label: "N", min: 5, max: 1, required: true }],
    } as AnswerSchemaSpec;
    expect(() => validateAnswerSchema("CUSTOM_TASK", minMax)).toThrow(ApiError);
  });

  it("normalizes a complete answer to one JSON object in field order, numbers as numbers", () => {
    const raw = JSON.stringify({ note: "  busy  ", price: "1,280", open: "OPEN" });
    expect(normalizeAnswer(FORM, raw)).toBe('{"open":"OPEN","price":1280,"note":"busy"}');
    // optional field left out
    expect(normalizeAnswer(FORM, JSON.stringify({ open: "CLOSED", price: 0 }))).toBe(
      '{"open":"CLOSED","price":0}',
    );
  });

  it("refuses non-objects, unknown keys, missing required fields and values that do not fit", () => {
    expect(normalizeAnswer(FORM, "OPEN")).toBeNull();
    expect(normalizeAnswer(FORM, "[1,2]")).toBeNull();
    expect(normalizeAnswer(FORM, JSON.stringify({ open: "OPEN", price: 1, extra: 1 }))).toBeNull();
    expect(normalizeAnswer(FORM, JSON.stringify({ open: "OPEN" }))).toBeNull(); // price missing
    expect(normalizeAnswer(FORM, JSON.stringify({ open: "MAYBE", price: 1 }))).toBeNull();
    expect(normalizeAnswer(FORM, JSON.stringify({ open: "OPEN", price: -3 }))).toBeNull();
    expect(
      normalizeAnswer(FORM, JSON.stringify({ open: "OPEN", price: 1, note: "x".repeat(201) })),
    ).toBeNull();
    expect(normalizeAnswer(FORM, JSON.stringify({ open: "OPEN", price: "" }))).toBeNull();
  });

  it("is stored as text with the fields in answer_spec and rebuilt as a form", () => {
    expect(storedAnswerKind(FORM)).toBe("text");
    const spec = storedAnswerSpec(FORM);
    expect(spec).toEqual({ fields: FORM.fields });
    expect(answerSchemaOf("text", [], spec)).toEqual(FORM);
    expect(answerSchemaOf("text", [], { max_chars: 10 })).toEqual({ type: "text", max_chars: 10 });
    expect(storedAnswerKind({ type: "enum", values: ["OPEN"] })).toBe("enum");
    expect(storedAnswerSpec({ type: "enum", values: ["OPEN"] })).toBeNull();
  });
});
