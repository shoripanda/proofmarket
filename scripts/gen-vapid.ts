// Generate the Web Push (VAPID) key pair once (04 §3.22) into ~/.config/proofmarket/env.vapid (mode 0600).
//   run gen-vapid.ts --subject mailto:you@example.com   (refuses to overwrite an existing file)
// Changing the keys later invalidates every worker's subscription, so keep them.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { args, need } from "./lib.ts";

const subject = need(args(), "subject");
if (!/^(mailto:|https:)/.test(subject)) throw new Error("--subject must start with mailto: or https:");
const dir = join(homedir(), ".config", "proofmarket");
const file = join(dir, "env.vapid");
if (existsSync(file)) {
  console.error(`${file} already exists; new keys would cut off every existing push subscription.`);
  process.exit(2);
}
mkdirSync(dir, { recursive: true, mode: 0o700 });
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const b = (s: string | undefined) => Buffer.from(s ?? "", "base64url");
const uncompressed = Buffer.concat([Buffer.from([4]), b(pub.x), b(pub.y)]).toString("base64url");
writeFileSync(
  file,
  [
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${uncompressed}`,
    `VAPID_PRIVATE_KEY=${priv.d}`,
    `VAPID_SUBJECT=${subject}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(`wrote ${file} (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)`);
process.exit(0);
