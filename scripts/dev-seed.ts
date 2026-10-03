// Local development data (DEV_MODE). Creates/migrates apps/web/.data/pglite and seeds:
// an API key with balance, places in central Tokyo, and worker invite codes. Writes apps/web/.data/dev.json.
//   pnpm --filter @proofmarket/scripts run run dev-seed.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migratePglite, openPgliteDb } from "@proofmarket/db/testing";
import {
  createPrincipal,
  issueApiKey,
  registerPlace,
  topUp,
} from "../apps/web/lib/services/admin-service.ts";
import { issueInvite } from "../apps/web/lib/services/worker-service.ts";

const dir = join(import.meta.dirname, "../apps/web/.data");
mkdirSync(dir, { recursive: true });
await migratePglite(join(dir, "pglite"));
const db = openPgliteDb(join(dir, "pglite"));
const principalId = await createPrincipal(db, { displayName: "Dev Agent", type: "organization" });
const { credentialId, apiKey } = await issueApiKey(db, {
  principalId,
  requesterName: "dev-agent",
  maxTaskAmount: "5",
  dailySpendLimit: "50",
  operator: "dev-seed",
});
await topUp(db, credentialId, "100");
const places = [
  { name: "dev: Shibuya Hachiko exit shop", lat: 35.6595, lng: 139.7005 },
  { name: "dev: Shinjuku south exit shop", lat: 35.6884, lng: 139.7006 },
];
const placeIds = [];
for (const p of places) placeIds.push(await registerPlace(db, { ...p, category: "retail", by: "dev-seed" }));
const invites = [];
for (let i = 0; i < 5; i++)
  invites.push(await issueInvite(db, { uses: 1, expiresAt: new Date(Date.now() + 30 * 86_400_000) }));
const out = { principal_id: principalId, api_key: apiKey, places, place_ids: placeIds, invites };
writeFileSync(join(dir, "dev.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);
