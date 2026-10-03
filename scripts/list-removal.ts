// List photo removal requests from /rules (04 §3.21, 08 §6) with decrypted addresses, or mark one.
//   run list-removal.ts [--status new|handled|rejected]
//   run list-removal.ts --mark rmv_... --as handled|rejected
// Env: DATABASE_URL, LOCATION_ENC_KEY. Do not paste the output anywhere persistent.
import { listRemovalRequests, setRemovalStatus } from "../apps/web/lib/services/removal-service.ts";
import { args, db, need } from "./lib.ts";

const a = args();
if (a.mark) {
  const as = need(a, "as");
  if (as !== "handled" && as !== "rejected") throw new Error("--as must be handled or rejected");
  await setRemovalStatus(db(), a.mark, as);
  console.log(JSON.stringify({ ok: true, id: a.mark, status: as }));
} else {
  const key = process.env.LOCATION_ENC_KEY;
  if (!key) throw new Error("LOCATION_ENC_KEY is required");
  console.log(
    JSON.stringify(await listRemovalRequests(db(), Buffer.from(key, "base64"), a.status ?? "new"), null, 2),
  );
}
process.exit(0);
