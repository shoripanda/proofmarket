// Change which task types an existing API key may create (01 §4.8).
//   run set-task-types.ts --credential key_... --types PLACE_STATUS_VERIFICATION,QUEUE_LENGTH --by <operator>
import type { TaskType } from "@proofmarket/core";
import { setAllowedTaskTypes } from "../apps/web/lib/services/admin-service.ts";
import { args, db, need } from "./lib.ts";

const a = args();
const types = need(a, "types").split(",") as TaskType[];
await setAllowedTaskTypes(db(), need(a, "credential"), types, need(a, "by"));
console.log(JSON.stringify({ ok: true, credential: a.credential, types }));
process.exit(0);
