// List sign-ups from /join (04 §3.20) with decrypted addresses, or mark one handled.
//   run list-participation.ts [--status new|contacted|closed]
//   run list-participation.ts --mark par_... --as contacted|closed
// Env: DATABASE_URL, LOCATION_ENC_KEY. Do not paste the output anywhere persistent.
import {
  listParticipationRequests,
  setParticipationStatus,
} from "../apps/web/lib/services/participation-service.ts";
import { args, db, need } from "./lib.ts";

const a = args();
if (a.mark) {
  const as = need(a, "as");
  if (as !== "contacted" && as !== "closed") throw new Error("--as must be contacted or closed");
  await setParticipationStatus(db(), a.mark, as);
  console.log(JSON.stringify({ ok: true, id: a.mark, status: as }));
} else {
  const key = process.env.LOCATION_ENC_KEY;
  if (!key) throw new Error("LOCATION_ENC_KEY is required");
  const rows = await listParticipationRequests(db(), Buffer.from(key, "base64"), a.status ?? "new");
  console.log(JSON.stringify(rows, null, 2));
}
process.exit(0);
