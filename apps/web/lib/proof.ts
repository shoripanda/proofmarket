// Links that let a requester show "a human checked this" to the person it answers (01 §4.21).
import type { VerificationResult } from "@proofmarket/core/schemas/api";

/** Public origin of this deployment. NEXT_PUBLIC_BASE_URL wins; on Vercel the production domain is the fallback. */
export function publicOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export function proofLinks(id: string, origin = publicOrigin()): NonNullable<VerificationResult["proof"]> {
  const url = `${origin}/r/${id}`;
  const badge_url = `${url}/badge.svg`;
  return { url, badge_url, markdown: `[![人が確認](${badge_url})](${url})` };
}
