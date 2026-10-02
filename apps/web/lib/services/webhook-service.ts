import "server-only";

/** `ProofMarket-Signature: t=<unix>,v1=<hex(HMAC-SHA256(secret, t + "." + body))>` (05 §5). PR-14. */
export function signWebhook(_secret: string, _timestampS: number, _body: string): string {
  throw new Error("NOT_IMPLEMENTED: signWebhook (PR-14)");
}

/** https only, no IP literals, DNS must not resolve to private/loopback/link-local, no redirects, 5 s timeout. PR-14. */
export async function deliverWebhook(_deliveryId: string): Promise<void> {
  throw new Error("NOT_IMPLEMENTED: deliverWebhook (PR-14)");
}
