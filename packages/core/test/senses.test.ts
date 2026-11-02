// docs/architecture 16 — the sensory catalogue: the shorthand builds the form, the form round-trips through
// storage, and the per-sense rules hold.
import { describe, expect, it } from "vitest";
import { AnswerSchemaSpec } from "../src/schemas/api.ts";
import { answerSchemaOf, normalizeAnswer, storedAnswerKind, storedAnswerSpec } from "../src/task/answers.ts";
import { sensesOfFields, sensoryAnswerProblem, sensoryAnswerSchema } from "../src/task/senses.ts";

describe("sensory catalogue (16 §5)", () => {
  it("builds the form from the shorthand, in catalogue order", () => {
    const s = AnswerSchemaSpec.parse({ type: "sensory", senses: ["smell", "sight"] });
    expect(s.type).toBe("form");
    if (s.type !== "form") return;
    expect(s.fields[0]?.key).toBe("sight_status");
    expect(sensesOfFields(s.fields)).toEqual(["sight", "smell"]);
  });

  it("round-trips through the stored columns and parses again", () => {
    const s = sensoryAnswerSchema(["sight", "hearing", "smell", "taste", "touch"]);
    const back = answerSchemaOf(storedAnswerKind(s), [], storedAnswerSpec(s));
    expect(back.type === "form" && sensesOfFields(back.fields)).toEqual([
      "sight",
      "hearing",
      "smell",
      "taste",
      "touch",
    ]);
    expect(() => AnswerSchemaSpec.parse(JSON.parse(JSON.stringify(back)))).not.toThrow();
  });

  it("a hand-made form that changes one catalogue field is not a sensory form", () => {
    const s = sensoryAnswerSchema(["smell"]);
    const changed = s.fields.map((f) => (f.key === "smell_note" ? { ...f, max_chars: 4000 } : f));
    expect(sensesOfFields(changed)).toBeNull();
  });

  it("keeps tags in the list's order", () => {
    const s = sensoryAnswerSchema(["touch"]);
    const out = normalizeAnswer(
      s,
      JSON.stringify({
        touch_status: "reported",
        touch_texture: ["wet", "smooth"],
        touch_temperature: "cold",
      }),
    );
    expect(JSON.parse(out ?? "{}").touch_texture).toEqual(["smooth", "wet"]);
  });

  it("checks a peak against the level", () => {
    const base = { hearing_status: "reported", hearing_loudness: 3, hearing_sources: ["music"] };
    expect(sensoryAnswerProblem(["hearing"], { ...base, hearing_level_db: 60, hearing_peak_db: 55 })).toBe(
      "hearing_peak_below_level",
    );
    expect(sensoryAnswerProblem(["hearing"], { ...base, hearing_peak_db: 70 })).toBe(
      "hearing_peak_without_level",
    );
    expect(sensoryAnswerProblem(["hearing"], { hearing_status: "not_present" })).toBeNull();
  });
});
