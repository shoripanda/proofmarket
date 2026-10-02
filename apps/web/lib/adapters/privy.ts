import "server-only";
import { PrivyClient } from "@privy-io/node";
import type { IdentityProvider } from "../ports";

export function createPrivyIdentity(cfg: {
  appId: string;
  appSecret: string;
  verificationKey?: string;
}): IdentityProvider {
  const privy = new PrivyClient({
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    ...(cfg.verificationKey ? { jwtVerificationKey: cfg.verificationKey } : {}),
  });
  return {
    async verifyAccessToken(token) {
      const r = await privy.utils().auth().verifyAccessToken(token);
      return { userId: r.user_id };
    },
    async payoutAddress(userId) {
      const user = await privy.users()._get(userId);
      for (const a of user.linked_accounts) {
        const w = a as { type?: string; chain_type?: string; connector_type?: string; address?: string };
        if (
          w.type === "wallet" &&
          w.chain_type === "solana" &&
          w.connector_type === "embedded" &&
          w.address
        ) {
          return w.address;
        }
      }
      return null;
    },
  };
}
