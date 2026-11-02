// Words for sensory reports (docs/architecture 16 §5) in both languages. The API's field labels are English for
// agents; the worker app shows these instead. Kept free of "use client" so server pages can use it too.
import type { Sense, SenseStatus } from "@proofmarket/core";
import type { Lang } from "./lang";

type Pair = [ja: string, en: string];

export const SENSE_NAME: Record<Sense, Pair> = {
  sight: ["見る（視覚）", "Sight"],
  hearing: ["聞く（聴覚）", "Hearing"],
  smell: ["におう（嗅覚）", "Smell"],
  taste: ["味わう（味覚）", "Taste"],
  touch: ["触る（触覚）", "Touch"],
};

export const SENSE_STATUS_TEXT: Record<SenseStatus, Pair> = {
  reported: ["答える", "Report"],
  not_present: ["何も感じなかった", "Nothing there"],
  declined: ["やめておく", "Skip"],
};

/** Field label and, for scales, the words at the two ends. */
export const SENSE_FIELD_TEXT: Record<string, { label: Pair; ends?: [Pair, Pair] }> = {
  sight_brightness: {
    label: ["明るさ", "Brightness"],
    ends: [
      ["暗い", "dark"],
      ["明るい", "bright"],
    ],
  },
  sight_cleanliness: {
    label: ["清潔さ", "Cleanliness"],
    ends: [
      ["汚い", "dirty"],
      ["きれい", "clean"],
    ],
  },
  hearing_loudness: {
    label: ["うるささ（感じたまま）", "Loudness (as you felt it)"],
    ends: [
      ["静か", "quiet"],
      ["うるさい", "loud"],
    ],
  },
  hearing_sources: { label: ["主な音（3つまで）", "Main sounds (up to 3)"] },
  smell_intensity: {
    label: ["においの強さ", "Strength"],
    ends: [
      ["しない", "none"],
      ["強い", "strong"],
    ],
  },
  smell_pleasantness: {
    label: ["心地よさ", "Pleasantness"],
    ends: [
      ["不快", "unpleasant"],
      ["心地よい", "pleasant"],
    ],
  },
  smell_kinds: { label: ["においの種類（3つまで）", "Kind of smell (up to 3)"] },
  taste_sweet: {
    label: ["甘さ", "Sweet"],
    ends: [
      ["なし", "none"],
      ["強い", "strong"],
    ],
  },
  taste_salty: {
    label: ["しょっぱさ", "Salty"],
    ends: [
      ["なし", "none"],
      ["強い", "strong"],
    ],
  },
  taste_sour: {
    label: ["酸っぱさ", "Sour"],
    ends: [
      ["なし", "none"],
      ["強い", "strong"],
    ],
  },
  taste_bitter: {
    label: ["苦さ", "Bitter"],
    ends: [
      ["なし", "none"],
      ["強い", "strong"],
    ],
  },
  taste_umami: {
    label: ["うま味", "Umami"],
    ends: [
      ["なし", "none"],
      ["強い", "strong"],
    ],
  },
  taste_liking: {
    label: ["全体の好み", "Overall liking"],
    ends: [
      ["苦手", "dislike"],
      ["好き", "like"],
    ],
  },
  touch_texture: { label: ["手ざわり（3つまで）", "Texture (up to 3)"] },
  touch_temperature: { label: ["触った温度", "Temperature to the touch"] },
  touch_firmness: {
    label: ["硬さ", "Firmness"],
    ends: [
      ["柔らかい", "soft"],
      ["硬い", "firm"],
    ],
  },
};

export const SENSE_WORD: Record<string, Pair> = {
  traffic: ["車・交通", "traffic"],
  voices: ["人の声", "voices"],
  music: ["音楽", "music"],
  construction: ["工事", "construction"],
  machinery: ["機械・空調", "machinery"],
  nature: ["自然（風・鳥・水）", "nature"],
  announcements: ["放送・アナウンス", "announcements"],
  other: ["その他", "other"],
  food: ["食べ物", "food"],
  coffee: ["コーヒー", "coffee"],
  smoke: ["煙・たばこ", "smoke or tobacco"],
  exhaust: ["排気ガス", "exhaust"],
  drain: ["下水・排水", "drain or sewage"],
  damp: ["湿気・カビ", "damp or mould"],
  chemical: ["薬品", "chemical"],
  perfume: ["香水・花", "perfume or flowers"],
  rubbish: ["ごみ", "rubbish"],
  smooth: ["なめらか", "smooth"],
  rough: ["ざらざら", "rough"],
  soft: ["柔らかい", "soft"],
  hard: ["硬い", "hard"],
  sticky: ["べたつく", "sticky"],
  oily: ["油っぽい", "oily"],
  wet: ["濡れている", "wet"],
  powdery: ["粉っぽい", "powdery"],
  cold: ["冷たい", "cold"],
  cool: ["ひんやり", "cool"],
  neutral: ["常温", "neutral"],
  warm: ["温かい", "warm"],
  hot: ["熱い", "hot"],
};

export const senseText = (lang: Lang, p: Pair | undefined, fallback: string) =>
  p ? (lang === "en" ? p[1] : p[0]) : fallback;

/** 16 §10: shown before taste or touch. Our words, never the requester's. */
export const BODY_NOTE: Pair = [
  "味わう・触るのは、あなたが大丈夫だと思うときだけにしてください。アレルギーに気をつけてください。いつでも「やめておく」を選べます。選んでも評価は下がりません。",
  'Taste or touch only if you are comfortable. Mind allergies. You can choose "Skip" at any time; it never lowers your standing.',
];

/** 16 §8: how to hold the phone while measuring. */
export const MEASURE_NOTE: Pair = [
  "スマホを胸の高さで持ち、マイクをふさがないでください。ポケットや鞄に入れないでください。10秒測ります。",
  "Hold the phone at chest height and keep the microphone uncovered, not in a pocket or bag. It measures for 10 s.",
];
