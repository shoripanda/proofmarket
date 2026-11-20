// 01 §4.31: a request may carry its text in Japanese and English. Workers see the version for their language
// (the app sends it in the x-pm-lang header) and the original text when there is none. Display only: answers keep
// the original choice values and form keys.
import type { RequestTranslations } from "@proofmarket/core/schemas/api";
import { LANG_HEADER, type Lang } from "../lang";

export const workerLang = (req: Request): Lang => (req.headers.get(LANG_HEADER) === "en" ? "en" : "ja");

interface Localizable {
  question: string;
  acceptance_criteria: string | null;
  answer_schema: unknown;
  translations: unknown;
}

export function localizeForWorker<T extends Localizable>(
  view: T,
  lang: Lang,
): Omit<T, "translations"> & { answer_labels: Record<string, string> } {
  const { translations, ...rest } = view;
  const t = (translations as RequestTranslations | null | undefined)?.[lang];
  if (!t) return { ...rest, answer_labels: {} };
  const labels = t.labels ?? {};
  const schema = rest.answer_schema as { type?: string; fields?: { key: string; label: string }[] } | null;
  const answer_schema =
    schema?.type === "form" && schema.fields
      ? { ...schema, fields: schema.fields.map((f) => ({ ...f, label: labels[f.key] ?? f.label })) }
      : rest.answer_schema;
  return {
    ...rest,
    question: t.question,
    acceptance_criteria: t.acceptance_criteria ?? rest.acceptance_criteria,
    answer_schema: answer_schema as T["answer_schema"],
    answer_labels: labels,
  };
}
