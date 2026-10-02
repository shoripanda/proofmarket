import "server-only";
import { after } from "next/server";
import type { AppContext } from "./context";
import { log } from "./log";
import { kick } from "./services/jobs";

/** Try the given outbox jobs once after the response is sent (02 §4.1). The tick retries anything left. */
export function kickAfter(app: AppContext, dedupeKeys: string[]): void {
  after(async () => {
    for (const k of dedupeKeys) {
      try {
        await kick(app, k);
      } catch (e) {
        log("warn", "kick failed", { dedupe_key: k, error: String(e) });
      }
    }
  });
}
