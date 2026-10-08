"use client";
// 13 §5: an agent asks a person to confirm something it says it did. Shown above the question, in the same
// amber band as the acceptance criteria.
import type { Lang } from "@/lib/lang";
import { pick } from "@/lib/lang";

export interface AttestationView {
  subject: "agent_action";
  description: string;
}

export function AttestationBand({
  lang,
  attestation,
  className = "",
}: {
  lang: Lang;
  attestation: AttestationView | null | undefined;
  className?: string;
}) {
  if (!attestation) return null;
  return (
    <p
      className={`whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 ${className}`}
    >
      <span className="font-bold">{pick(lang, "確かめる相手: ", "Who you are checking: ")}</span>
      {pick(
        lang,
        `AI エージェントが『${attestation.description}』と言っています。本当かを見てきてください`,
        `An AI agent says “${attestation.description}”. Please go and see whether it is true.`,
      )}
    </p>
  );
}
