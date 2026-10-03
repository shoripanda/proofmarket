// Register a requester webhook endpoint (05 §5). Prints the signing secret once.
//   WEBHOOK_SIGNING_SECRET_PEPPER=... run register-webhook.ts --credential key_... --url https://... \
//     --events verification.verified,verification.settled,verification.rejected,verification.expired,verification.cancelled --by <operator>
import type { WebhookEvent } from "@proofmarket/core";
import type { AppContext } from "../apps/web/lib/context.ts";
import { registerWebhook } from "../apps/web/lib/services/webhook-service.ts";
import { args, db, need } from "./lib.ts";

const a = args();
const pepper = process.env.WEBHOOK_SIGNING_SECRET_PEPPER;
if (!pepper) {
  console.error("WEBHOOK_SIGNING_SECRET_PEPPER is required (same value as the app)");
  process.exit(2);
}
const app = { db: db(), now: () => new Date(), config: { webhookPepper: pepper } } as unknown as AppContext;
const r = await registerWebhook(app, {
  credentialId: need(a, "credential"),
  url: need(a, "url"),
  events: need(a, "events").split(",") as WebhookEvent[],
  by: need(a, "by"),
});
console.log(JSON.stringify({ endpoint_id: r.endpointId, signing_secret: r.secret }, null, 2));
console.error("Give the signing secret to the requester now. It cannot be shown again.");
process.exit(0);
