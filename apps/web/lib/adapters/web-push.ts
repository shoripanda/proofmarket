import "server-only";
// Web Push adapter (VAPID). Created only when all three VAPID variables are set; otherwise push is off.
import webpush from "web-push";
import type { PushSender } from "../ports";

export function createWebPushSender(o: {
  publicKey: string;
  privateKey: string;
  subject: string;
}): PushSender {
  return {
    async send(sub, payload) {
      try {
        await webpush.sendNotification(sub, payload, {
          vapidDetails: o,
          TTL: 15 * 60, // a task notice is useless after a while
          urgency: "high",
        });
        return { ok: true };
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        return { ok: false, gone: status === 404 || status === 410 };
      }
    },
  };
}
