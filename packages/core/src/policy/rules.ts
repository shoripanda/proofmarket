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

/** Keyword lists per rule. Filled in PR-03 together with U-POL-01..13 (each needs a near-miss allowed example). */
export const POLICY_KEYWORDS: Record<Exclude<PolicyRuleId, "TYPE_ALLOWLIST">, PolicyKeywords> = {
  PERSON_TRACKING: { ja: [], en: [] },
  PRIVATE_RESIDENCE: { ja: [], en: [] },
  TRESPASS: { ja: [], en: [] },
  WEAPONS_DRUGS: { ja: [], en: [] },
  SEXUAL: { ja: [], en: [] },
  PROFESSIONAL_JUDGMENT: { ja: [], en: [] },
  HARASSMENT: { ja: [], en: [] },
  DANGER: { ja: [], en: [] },
  EVASION: { ja: [], en: [] },
  MINORS: { ja: [], en: [] },
  COVERT_RECORDING: { ja: [], en: [] },
  IMPERSONATION: { ja: [], en: [] },
};

export type PolicyResult = { ok: true } | { ok: false; ruleId: PolicyRuleId };

/** Question text is untrusted input: never passed to any LLM prompt as instructions (REQ-T-003). */
export function evaluateQuestion(_question: string): PolicyResult {
  throw new Error("NOT_IMPLEMENTED: evaluateQuestion (PR-03)");
}

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function parseBBox(_raw: string): BBox {
  throw new Error("NOT_IMPLEMENTED: parseBBox (PR-04)");
}

export function inBBox(_p: { lat: number; lng: number }, _b: BBox): boolean {
  throw new Error("NOT_IMPLEMENTED: inBBox (PR-04)");
}
