// Generate app secrets once (02 §6.2) into ~/.config/proofmarket/env.secrets (mode 0600). Never commit.
//   run gen-secrets.ts            (refuses to overwrite an existing file)
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".config", "proofmarket");
const file = join(dir, "env.secrets");
if (existsSync(file)) {
  console.error(
    `${file} already exists; delete it first if you really want new secrets (rotating breaks existing data).`,
  );
  process.exit(2);
}
mkdirSync(dir, { recursive: true, mode: 0o700 });
const b64url = (n: number) => randomBytes(n).toString("base64url");
writeFileSync(
  file,
  [
    `LOCATION_ENC_KEY=${randomBytes(32).toString("base64")}`,
    `WORKER_REF_SALT=${b64url(32)}`,
    `WEBHOOK_SIGNING_SECRET_PEPPER=${b64url(32)}`,
    `INTERNAL_CRON_SECRET=${b64url(32)}`,
    `ADMIN_TOKEN=${b64url(32)}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log(
  `wrote ${file} (LOCATION_ENC_KEY, WORKER_REF_SALT, WEBHOOK_SIGNING_SECRET_PEPPER, INTERNAL_CRON_SECRET, ADMIN_TOKEN)`,
);
process.exit(0);
