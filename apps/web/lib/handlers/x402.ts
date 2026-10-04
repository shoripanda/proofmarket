import "server-only";
// POST /v1/x402/verifications (01 §4.19, 05 §2.9). x402 v2 HTTP transport: PAYMENT-REQUIRED (402),
// PAYMENT-SIGNATURE (request), PAYMENT-RESPONSE (result). No API key: the payment authorizes the request.

import { encodeHeader } from "@proofmarket/solana";
import type { AppContext } from "../context";
import { readJson } from "../http";
import { clientIp } from "../services/oauth-service";
import { consumeRateLimit, rateLimitHeaders } from "../services/rate-limit";
import { createWithPayment, X402_LIMITS } from "../services/x402-service";

const EXPOSE = { "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE" };

export async function handleX402Create(
  app: AppContext,
  req: Request,
): Promise<{ res: Response; created: string | null }> {
  const rl = await consumeRateLimit(app, `x402:${clientIp(req)}`, X402_LIMITS.rateLimitPerMin);
  const out = await createWithPayment(
    app,
    req.url,
    await readJson(req),
    req.headers.get("payment-signature"),
  );
  const base = { ...rateLimitHeaders(rl), ...EXPOSE };
  switch (out.kind) {
    case "required":
      return {
        res: Response.json(out.body, {
          status: 402,
          headers: { ...base, "PAYMENT-REQUIRED": encodeHeader(out.body) },
        }),
        created: null,
      };
    case "rejected":
      return {
        res: Response.json(out.body, {
          status: out.status,
          headers: {
            ...base,
            "PAYMENT-REQUIRED": encodeHeader(out.body),
            "PAYMENT-RESPONSE": encodeHeader(out.settlement),
          },
        }),
        created: null,
      };
    case "reused":
      return { res: Response.json(out.result.body, { status: 200, headers: base }), created: null };
    case "created":
      return {
        res: Response.json(out.body, {
          status: out.status,
          headers: { ...base, "PAYMENT-RESPONSE": encodeHeader(out.settlement) },
        }),
        created: out.verificationId,
      };
  }
}
