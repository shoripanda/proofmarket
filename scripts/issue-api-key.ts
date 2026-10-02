// Issue a requester API key (04 §5). Prints the key ONCE; only SHA-256(secret) is stored.
//   run issue-api-key.ts --principal "Acme Agents" --type organization --max-task 5 --daily 20 [--topup 10] --by <operator>
import { createPrincipal, issueApiKey, topUp } from "../apps/web/lib/services/admin-service.ts";
import { args, db, need } from "./lib.ts";

const a = args();
const d = db();
const principalId =
  a["principal-id"] ??
  (await createPrincipal(d, {
    displayName: need(a, "principal"),
    type: (a.type as "person" | "organization") ?? "organization",
  }));
const { credentialId, apiKey } = await issueApiKey(d, {
  principalId,
  requesterName: a.name ?? need(a, "principal"),
  maxTaskAmount: need(a, "max-task"),
  dailySpendLimit: need(a, "daily"),
  operator: need(a, "by"),
});
if (a.topup) await topUp(d, credentialId, a.topup);
console.log(
  JSON.stringify({ principal_id: principalId, credential_id: credentialId, api_key: apiKey }, null, 2),
);
console.error("Store the api_key now. It cannot be shown again.");
process.exit(0);
