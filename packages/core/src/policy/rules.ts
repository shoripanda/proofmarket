// Request content policy (08-security-privacy-operations.md §3, REQ-T-001..003, REQ-X-T-101..104).
// Matching happens after NFKC normalization and lowercasing. Keyword lists (ja + en) are filled in PR-03.

export const POLICY_RULE_VERSION = "2026-10-02" as const;

export const POLICY_RULES = {
  TYPE_ALLOWLIST: "Only PLACE_STATUS_VERIFICATION is accepted",
  PERSON_TRACKING: "Tracking or identifying a specific person",
  PRIVATE_RESIDENCE: "Private residences",
  TRESPASS: "Entering restricted or private property",
  WEAPONS_DRUGS: "Weapons, drugs, controlled goods",
  SEXUAL: "Sexual services or content",
  PROFESSIONAL_JUDGMENT: "Medical, legal or financial professional judgment",
  HARASSMENT: "Harassment or intimidation",
  DANGER: "Dangerous physical activity",
  EVASION: "Evading law enforcement or access controls",
  MINORS: "Children or minors",
  COVERT_RECORDING: "Covert recording",
  IMPERSONATION: "Impersonation",
} as const;
export type PolicyRuleId = keyof typeof POLICY_RULES;

export interface PolicyKeywords {
  ja: readonly string[];
  en: readonly string[];
}

/**
 * Keyword lists per rule. ja: substring match after NFKC + lowercase. en: whole-word match (so "drugstore"
 * does not hit "drug"). Each rule has a near-miss allowed example in U-POL tests.
 */
export const POLICY_KEYWORDS: Record<Exclude<PolicyRuleId, "TYPE_ALLOWLIST">, PolicyKeywords> = {
  PERSON_TRACKING: {
    ja: [
      "誰々",
      "後をつけ",
      "尾行",
      "顔写真",
      "顔を撮",
      "住んでいる",
      "住んでる",
      "在宅か",
      "張り込み",
      "居場所",
    ],
    en: [
      "stalk",
      "stalking",
      "follow him",
      "follow her",
      "follow them",
      "whereabouts",
      "lives at",
      "his face",
      "her face",
      "identify who",
      "is he there",
      "is she there",
    ],
  },
  PRIVATE_RESIDENCE: {
    ja: ["自宅", "住所", "個人宅", "民家", "アパート", "マンションの部屋", "部屋番号"],
    en: [
      "private residence",
      "someone's home",
      "his house",
      "her house",
      "their house",
      "home address",
      "apartment",
      "house number",
    ],
  },
  TRESPASS: {
    ja: ["中に入って", "侵入", "裏口", "立入禁止", "立ち入り禁止", "関係者以外", "敷地内に入", "柵を越え"],
    en: ["go inside", "sneak in", "back door", "no entry", "restricted area", "trespass", "climb the fence"],
  },
  WEAPONS_DRUGS: {
    ja: ["拳銃", "銃を", "刃物", "ナイフ", "爆発物", "薬物", "大麻", "覚醒剤", "覚せい剤", "麻薬"],
    en: [
      "gun",
      "guns",
      "firearm",
      "firearms",
      "weapon",
      "weapons",
      "knife",
      "explosive",
      "explosives",
      "drug",
      "drugs",
      "cocaine",
      "cannabis",
      "marijuana",
      "meth",
      "narcotics",
    ],
  },
  SEXUAL: {
    ja: ["風俗", "性的", "売春", "アダルト", "ヌード"],
    en: ["sex", "sexual", "escort", "prostitute", "prostitution", "nude", "adult service"],
  },
  PROFESSIONAL_JUDGMENT: {
    ja: ["診断", "処方", "病気か", "法的に", "違法かどうか", "投資判断", "買うべき", "売るべき"],
    en: [
      "diagnose",
      "diagnosis",
      "medical advice",
      "legal advice",
      "is it legal",
      "investment advice",
      "should i buy",
      "should i sell",
      "should i invest",
    ],
  },
  HARASSMENT: {
    ja: ["脅し", "脅して", "嫌がらせ", "威圧", "晒し", "怒鳴"],
    en: ["threaten", "intimidate", "harass", "harassment", "scare them", "confront"],
  },
  DANGER: {
    ja: ["台風の中", "線路", "屋根に", "高速道路", "川に入", "工事現場", "崖"],
    en: [
      "during the typhoon",
      "railway track",
      "train tracks",
      "rooftop",
      "on the roof",
      "highway",
      "construction site",
      "cliff",
    ],
  },
  EVASION: {
    ja: ["警察", "監視カメラを避", "防犯カメラを避", "見つからないように", "検問", "警備員に"],
    en: [
      "police",
      "avoid the camera",
      "avoid the cameras",
      "avoid cameras",
      "avoid camera",
      "without being caught",
      "checkpoint",
      "security guard",
    ],
  },
  MINORS: {
    ja: ["子ども", "子供", "児童", "小学生", "中学生", "未成年", "学校の前", "保育園"],
    en: ["child", "children", "kid", "kids", "minor", "minors", "schoolchildren", "toddler"],
  },
  COVERT_RECORDING: {
    ja: ["気づかれずに", "気付かれずに", "隠し撮り", "盗撮", "こっそり", "バレないように"],
    en: ["secretly", "covertly", "hidden camera", "without them knowing", "without being noticed"],
  },
  IMPERSONATION: {
    ja: ["ふりをして", "装って", "なりすま", "名乗って"],
    en: ["pretend to be", "pretending to be", "pose as", "posing as", "impersonate"],
  },
};

export type PolicyResult = { ok: true } | { ok: false; ruleId: PolicyRuleId };

const normalize = (s: string) => s.normalize("NFKC").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const COMPILED = (
  Object.entries(POLICY_KEYWORDS) as [Exclude<PolicyRuleId, "TYPE_ALLOWLIST">, PolicyKeywords][]
).map(([ruleId, kw]) => ({
  ruleId,
  ja: kw.ja.map(normalize),
  en: kw.en.length
    ? new RegExp(`(?<![a-z0-9])(?:${kw.en.map((w) => escapeRe(normalize(w))).join("|")})(?![a-z0-9])`)
    : null,
}));

/** Question text is untrusted input: never passed to any LLM prompt as instructions (REQ-T-003). */
export function evaluateQuestion(question: string): PolicyResult {
  const q = normalize(question);
  for (const r of COMPILED) {
    if (r.ja.some((w) => q.includes(w)) || r.en?.test(q)) return { ok: false, ruleId: r.ruleId };
  }
  return { ok: true };
}

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** "minLat,minLng,maxLat,maxLng" */
export function parseBBox(raw: string): BBox {
  const parts = raw.split(",").map((p) => Number(p.trim()));
  const [minLat, minLng, maxLat, maxLng] = parts;
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isFinite(n)) ||
    minLat === undefined ||
    minLng === undefined ||
    maxLat === undefined ||
    maxLng === undefined ||
    minLat >= maxLat ||
    minLng >= maxLng
  ) {
    throw new Error(`invalid bbox: ${raw}`);
  }
  return { minLat, minLng, maxLat, maxLng };
}

export function inBBox(p: { lat: number; lng: number }, b: BBox): boolean {
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}
