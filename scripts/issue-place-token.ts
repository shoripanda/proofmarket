// Give a registered shop a secret link to report its own status (01 §4.13). The link is shown ONCE.
//   run issue-place-token.ts --place plc_... --base-url https://<app> --by <operator>
//   run issue-place-token.ts --revoke pot_...
import { issuePlaceToken, revokePlaceToken } from "../apps/web/lib/services/store-service.ts";
import { args, db, need } from "./lib.ts";

const a = args();
if (a.revoke) {
  await revokePlaceToken(db(), a.revoke, new Date());
  console.log(JSON.stringify({ ok: true, revoked: a.revoke }));
} else {
  const { tokenId, token } = await issuePlaceToken(db(), need(a, "place"), need(a, "by"));
  const base = need(a, "base-url").replace(/\/$/, "");
  console.log(JSON.stringify({ token_id: tokenId, link: `${base}/store/${token}` }, null, 2));
  console.error("Send this link to the shop now. It cannot be shown again.");
}
process.exit(0);
