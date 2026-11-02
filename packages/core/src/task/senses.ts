// Sensory reports (docs/architecture 16): the five senses as a verification type. The requester picks senses;
// the form is built from this fixed catalogue so answers can be compared across requests and witnesses.
import type { FormField } from "../schemas/api.ts";

export const SENSES = ["sight", "hearing", "smell", "taste", "touch"] as const;
export type Sense = (typeof SENSES)[number];

/** 16 §6: every sense block starts with one of these. Only `reported` carries values. */
export const SENSE_STATUSES = ["reported", "not_present", "declined"] as const;
export type SenseStatus = (typeof SENSE_STATUSES)[number];

export const HEARING_SOURCES = [
  "traffic",
  "voices",
  "music",
  "construction",
  "machinery",
  "nature",
  "announcements",
  "other",
] as const;
export const SMELL_KINDS = [
  "food",
  "coffee",
  "smoke",
  "exhaust",
  "drain",
  "damp",
  "chemical",
  "perfume",
  "rubbish",
  "other",
] as const;
export const TOUCH_TEXTURES = [
  "smooth",
  "rough",
  "soft",
  "hard",
  "sticky",
  "oily",
  "wet",
  "powdery",
] as const;
export const TOUCH_TEMPERATURES = ["cold", "cool", "neutral", "warm", "hot"] as const;

/** 16 §8: the range a phone can sensibly report, in approximate dB. */
export const SOUND_DB = { min: 20, max: 130 } as const;
/** 16 §8: a measurement lasts about 10 s; accept a little either way. */
export const SOUND_MEASURE_S = { min: 8, max: 20 } as const;
export const SENSE_NOTE_MAX_CHARS = 200;

const scale = (key: string, label: string, ends: [string, string]): FormField => ({
  type: "scale",
  key,
  label,
  min: 1,
  max: 5,
  labels: ends,
  required: false,
});
const tags = (key: string, label: string, values: readonly string[]): FormField => ({
  type: "tags",
  key,
  label,
  values: [...values],
  max: 3,
  required: false,
});

interface SenseBlock {
  /** Fields after `<sense>_status`, before `<sense>_note`. */
  fields: FormField[];
  /** Keys that must be filled when the status is `reported`. */
  required: string[];
}

export const SENSE_CATALOGUE: Record<Sense, SenseBlock> = {
  sight: {
    fields: [
      scale("sight_brightness", "Brightness", ["dark", "bright"]),
      scale("sight_cleanliness", "Cleanliness", ["dirty", "clean"]),
    ],
    required: ["sight_brightness", "sight_cleanliness"],
  },
  hearing: {
    fields: [
      {
        type: "number",
        key: "hearing_level_db",
        label: "Sound level over 10 s (approximate dB, measured by the phone)",
        unit: "dB",
        min: SOUND_DB.min,
        max: SOUND_DB.max,
        required: false,
      },
      {
        type: "number",
        key: "hearing_peak_db",
        label: "Loudest second (approximate dB, measured by the phone)",
        unit: "dB",
        min: SOUND_DB.min,
        max: SOUND_DB.max,
        required: false,
      },
      scale("hearing_loudness", "Loudness", ["quiet", "loud"]),
      tags("hearing_sources", "Main sources of sound", HEARING_SOURCES),
    ],
    required: ["hearing_loudness", "hearing_sources"],
  },
  smell: {
    fields: [
      scale("smell_intensity", "Smell intensity", ["none", "strong"]),
      scale("smell_pleasantness", "Pleasantness", ["unpleasant", "pleasant"]),
      tags("smell_kinds", "Kind of smell", SMELL_KINDS),
    ],
    required: ["smell_intensity", "smell_pleasantness", "smell_kinds"],
  },
  taste: {
    fields: [
      scale("taste_sweet", "Sweet", ["none", "strong"]),
      scale("taste_salty", "Salty", ["none", "strong"]),
      scale("taste_sour", "Sour", ["none", "strong"]),
      scale("taste_bitter", "Bitter", ["none", "strong"]),
      scale("taste_umami", "Umami", ["none", "strong"]),
      scale("taste_liking", "Overall liking", ["dislike", "like"]),
    ],
    required: ["taste_sweet", "taste_salty", "taste_sour", "taste_bitter", "taste_umami", "taste_liking"],
  },
  touch: {
    fields: [
      tags("touch_texture", "Texture", TOUCH_TEXTURES),
      {
        type: "enum",
        key: "touch_temperature",
        label: "Temperature to the touch",
        values: [...TOUCH_TEMPERATURES],
        required: false,
      },
      scale("touch_firmness", "Firmness", ["soft", "firm"]),
    ],
    required: ["touch_texture", "touch_temperature"],
  },
};

/** 16 §3: fields the phone measured; everything else is what the person reported. */
export const MEASURED_SENSE_FIELDS = ["hearing_level_db", "hearing_peak_db"] as const;

const statusKey = (s: Sense) => `${s}_status`;
const noteKey = (s: Sense) => `${s}_note`;

/** The fields of one sense, in order: status, the sense's own fields, note. */
export function senseFields(s: Sense): FormField[] {
  return [
    {
      type: "enum",
      key: statusKey(s),
      label: `${s[0]?.toUpperCase()}${s.slice(1)}: reported, not present, or declined`,
      values: [...SENSE_STATUSES],
      required: true,
    },
    ...SENSE_CATALOGUE[s].fields,
    { type: "text", key: noteKey(s), label: "Note", max_chars: SENSE_NOTE_MAX_CHARS, required: false },
  ];
}

/** The answer schema of a sensory report for the chosen senses, in catalogue order (16 §4). */
export function sensoryAnswerSchema(senses: readonly Sense[]): { type: "form"; fields: FormField[] } {
  const chosen = SENSES.filter((s) => senses.includes(s));
  return { type: "form", fields: chosen.flatMap(senseFields) };
}

/** The senses a stored form covers, or null when the form is not exactly a sensory report. */
export function sensesOfFields(fields: readonly FormField[]): Sense[] | null {
  const senses = SENSES.filter((s) => fields.some((f) => f.key === statusKey(s)));
  if (senses.length === 0) return null;
  const want = sensoryAnswerSchema(senses).fields;
  return JSON.stringify(normalizeFieldList(fields)) === JSON.stringify(normalizeFieldList(want))
    ? senses
    : null;
}

/** Fill defaults so a stored or parsed form compares equal to a generated one. */
function normalizeFieldList(fields: readonly FormField[]): unknown[] {
  return fields.map((f) => {
    const base = { ...f, required: f.required ?? true } as Record<string, unknown>;
    if (f.type === "scale") base.min = f.min ?? 1;
    return Object.fromEntries(Object.entries(base).sort(([a], [b]) => a.localeCompare(b)));
  });
}

export const isSensoryFieldList = (fields: readonly FormField[]): boolean => sensesOfFields(fields) !== null;

/**
 * 16 §6: per sense, `reported` needs its required fields and nothing else may be set otherwise; a peak below the
 * level is impossible; a report where every sense is declined is not an answer. Returns a reason, or null if fine.
 */
export function sensoryAnswerProblem(
  senses: readonly Sense[],
  answer: Record<string, unknown>,
): string | null {
  const has = (k: string) => answer[k] !== undefined;
  let anyAnswered = false;
  for (const s of senses) {
    const status = answer[statusKey(s)];
    const own = SENSE_CATALOGUE[s].fields.map((f) => f.key);
    if (status === "reported") {
      const missing = SENSE_CATALOGUE[s].required.find((k) => !has(k));
      if (missing) return `${missing}_required`;
      anyAnswered = true;
    } else {
      if (own.some(has)) return `${s}_values_without_report`;
      if (status === "not_present") anyAnswered = true;
    }
  }
  if (!anyAnswered) return "all_declined";
  if (has("hearing_peak_db") && !has("hearing_level_db")) return "hearing_peak_without_level";
  const level = answer.hearing_level_db;
  const peak = answer.hearing_peak_db;
  if (typeof level === "number" && typeof peak === "number" && peak < level)
    return "hearing_peak_below_level";
  return null;
}

/** True when the answer carries a measured sound level, which needs `measurements.sound` (16 §8). */
export const answerHasSoundLevel = (answer: Record<string, unknown>): boolean =>
  typeof answer.hearing_level_db === "number";
