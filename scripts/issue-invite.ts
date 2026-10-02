// Issue a worker invite code (04 §3.5). Prints the code once; only its hash is stored.
//   run issue-invite.ts --uses 1 --days 7
import { issueInvite } from "../apps/web/lib/services/worker-service.ts";
import { args, db } from "./lib.ts";

const a = args();
const code = await issueInvite(db(), {
  uses: Number(a.uses ?? 1),
  expiresAt: new Date(Date.now() + Number(a.days ?? 7) * 86_400_000),
});
console.log(JSON.stringify({ invite_code: code }));
process.exit(0);
