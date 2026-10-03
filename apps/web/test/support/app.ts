// Test AppContext over PGlite with a controllable clock.
import { randomBytes } from "node:crypto";
import { createTestDb } from "@proofmarket/db/testing";
import type { AppContext } from "../../lib/context";
import { route } from "../../lib/http";
import { createPrincipal, issueApiKey, registerPlace, topUp } from "../../lib/services/admin-service";
import { FakeChain } from "./chain";
import { FakeIdentity, FakePush, FakeStorage } from "./fakes";

export const SHOP = { lat: 35.6595, lng: 139.7005 };

export async function createTestApp(start = new Date("2026-10-09T03:00:00Z")) {
  const { db } = await createTestDb();
  let now = start;
  const identity = new FakeIdentity();
  const storage = new FakeStorage(() => now);
  const chain = new FakeChain();
  const push = new FakePush();
  const app: AppContext = {
    db,
    now: () => now,
    identity,
    storage,
    settlement: () => chain,
    push,
    config: {
      appEnv: "test",
      pilotBBox: { minLat: 35.6, minLng: 139.65, maxLat: 35.72, maxLng: 139.78 },
      maxWitnesses: 5,
      locationEncKey: randomBytes(32),
      workerRefSalt: "test-salt-test-salt",
      webhookPepper: "test-pepper-test-pepper",
    },
  };
  const principalId = await createPrincipal(db, { displayName: "Test Agent Co", type: "organization" });
  const { credentialId, apiKey } = await issueApiKey(db, {
    principalId,
    requesterName: "test-agent",
    maxTaskAmount: "5",
    dailySpendLimit: "20",
    operator: "test",
  });
  await topUp(db, credentialId, "10");
  const placeId = await registerPlace(db, { name: "test shop", ...SHOP, category: "retail", by: "test" });
  return {
    app,
    db,
    identity,
    storage,
    chain,
    push,
    principalId,
    credentialId,
    apiKey,
    placeId,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    setNow: (d: Date) => {
      now = d;
    },
  };
}

/** Call a handler through route() so ApiErrors become HTTP responses, like in production. */
export async function call(fn: (req: Request) => Promise<Response>, req: Request): Promise<Response> {
  return route(async (r: Request) => fn(r))(req, undefined);
}

export function jsonReq(
  method: string,
  path: string,
  o: { key?: string; body?: unknown; idem?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(`http://test${path}`, {
    method,
    headers: {
      ...(o.key ? { authorization: `Bearer ${o.key}` } : {}),
      ...(o.idem ? { "idempotency-key": o.idem } : {}),
      ...(o.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(o.headers ?? {}),
    },
    ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
  });
}

export function createBody(principalRef: string, o: Record<string, unknown> = {}) {
  return {
    type: "PLACE_STATUS_VERIFICATION",
    question: "Is this shop open right now?",
    answer_schema: { type: "enum", values: ["OPEN", "CLOSED", "UNCLEAR"] },
    location: { ...SHOP, radius_m: 80 },
    deadline: "2026-10-09T04:00:00Z",
    freshness: { max_age_seconds: 300 },
    evidence_requirements: { photo: true, task_nonce: true },
    assurance: { required_witnesses: 1, quorum: 1 },
    bounty: { asset: "USDC", amount: "0.50", network: "solana-devnet" },
    principal_ref: principalRef,
    ...o,
  };
}
