// 01 §4.31: workers see the request in their language; answers keep the original values and keys.
import { describe, expect, it } from "vitest";
import { localizeForWorker } from "@/lib/services/request-translation";

const base = {
  verification_id: "ver_1",
  question: "傘を開いて、骨の本数を数えてください。",
  acceptance_criteria: "開いた傘の写真",
  answer_schema: {
    type: "form",
    fields: [
      { type: "enum", key: "count", label: "本数", values: ["8本", "それ以外"] },
      { type: "text", key: "note", label: "メモ" },
    ],
  },
  translations: {
    en: {
      question: "Open an umbrella and count its ribs.",
      acceptance_criteria: "A photo of the open umbrella",
      labels: { count: "Ribs", "8本": "8", それ以外: "Other" },
    },
  },
};

describe("localizeForWorker", () => {
  it("swaps the text and the field labels for the worker's language", () => {
    const v = localizeForWorker(base, "en");
    expect(v.question).toBe("Open an umbrella and count its ribs.");
    expect(v.acceptance_criteria).toBe("A photo of the open umbrella");
    expect(v.answer_schema.fields.map((f) => [f.key, f.label])).toEqual([
      ["count", "Ribs"],
      ["note", "メモ"],
    ]);
    // Values stay as they are; the labels are shown in their place.
    expect(v.answer_schema.fields[0]?.values).toEqual(["8本", "それ以外"]);
    expect(v.answer_labels["8本"]).toBe("8");
    expect("translations" in v).toBe(false);
  });

  it("keeps the original text when there is no version for that language", () => {
    const v = localizeForWorker(base, "ja");
    expect(v.question).toBe(base.question);
    expect(v.answer_labels).toEqual({});
    expect("translations" in v).toBe(false);
  });

  it("handles a request with no translations", () => {
    const v = localizeForWorker({ ...base, translations: null }, "en");
    expect(v.question).toBe(base.question);
  });
});
