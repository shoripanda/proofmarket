// Workers who asked for yen payouts (01 §4.10): count and Privy user IDs to contact once yen payouts are ready.
//   run list-yen-interest.ts
import { schema } from "@proofmarket/db";
import { isNotNull } from "drizzle-orm";
import { db } from "./lib.ts";

const rows = await db()
  .select({
    worker: schema.workers.id,
    privy: schema.workers.privyUserId,
    since: schema.workers.yenPayoutInterestAt,
  })
  .from(schema.workers)
  .where(isNotNull(schema.workers.yenPayoutInterestAt));
console.log(JSON.stringify({ count: rows.length, workers: rows }, null, 2));
process.exit(0);
