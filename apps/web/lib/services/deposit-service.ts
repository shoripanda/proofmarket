import "server-only";
// Self-service deposits (15 §4.3). The requester asks for a deposit reference once; the console shows the
// operator's address with Solana Pay links that carry the reference. Every tick looks up finalized transfers
// by reference and credits a TOPUP, one row per transaction signature so nothing is counted twice.

import { generateKeyPairSync } from "node:crypto";
import { fromBaseUnits, fromMicro, toMicro } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { type ChainDeposit, solanaPayUrls } from "@proofmarket/solana";
import bs58 from "bs58";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { log } from "../log";

/** Credentials polled per tick; the least recently checked go first, so everyone gets a turn. */
export const DEPOSIT_POLL_PER_TICK = 25;

/** A fresh ed25519 public key as the reference: on the curve, so every wallet accepts it as an account. */
export function newDepositReference(): string {
  const { publicKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  return bs58.encode(Buffer.from(jwk.x ?? "", "base64url"));
}

/** Create the requester's reference unless it exists; the console calls this from the deposit button. */
export async function ensureDepositReference(app: AppContext, auth: RequesterAuth): Promise<string> {
  const [row] = await app.db
    .select({ ref: schema.requesterCredentials.depositReference })
    .from(schema.requesterCredentials)
    .where(eq(schema.requesterCredentials.id, auth.credentialId));
  if (row?.ref) return row.ref;
  const ref = newDepositReference();
  await app.db
    .update(schema.requesterCredentials)
    .set({ depositReference: ref })
    .where(and(eq(schema.requesterCredentials.id, auth.credentialId), sql`deposit_reference is null`));
  return ensureDepositReference(app, auth);
}

/** What the console shows: addresses and links when a reference exists, plus the recent deposits. */
export async function depositView(app: AppContext, auth: RequesterAuth) {
  const [row] = await app.db
    .select({ ref: schema.requesterCredentials.depositReference })
    .from(schema.requesterCredentials)
    .where(eq(schema.requesterCredentials.id, auth.credentialId));
  const recent = await app.db
    .select()
    .from(schema.deposits)
    .where(eq(schema.deposits.credentialId, auth.credentialId))
    .orderBy(desc(schema.deposits.slot), desc(schema.deposits.createdAt))
    .limit(20);
  const list = recent.map((d) => ({
    signature: d.signature,
    asset: d.asset as "USDC" | "SOL",
    amount: fromMicro(toMicro(String(d.amount))),
    from: d.fromPubkey,
    credited_at: d.createdAt.toISOString(),
  }));
  if (!row?.ref) return { reference: null, addresses: null, solana_pay: null, deposits: list };
  const addresses = app.settlement().depositAddresses();
  return { reference: row.ref, addresses, solana_pay: solanaPayUrls(addresses, row.ref), deposits: list };
}

/** Tick step: poll the references and credit new deposits. Returns how many were credited. */
export async function runDeposits(app: AppContext): Promise<number> {
  const creds = await app.db
    .select({ id: schema.requesterCredentials.id, ref: schema.requesterCredentials.depositReference })
    .from(schema.requesterCredentials)
    .where(
      and(
        isNotNull(schema.requesterCredentials.depositReference),
        eq(schema.requesterCredentials.status, "active"),
      ),
    )
    .orderBy(sql`deposit_checked_at asc nulls first`)
    .limit(DEPOSIT_POLL_PER_TICK);
  let credited = 0;
  for (const c of creds) {
    if (!c.ref) continue;
    try {
      credited += await pollOne(app, c.id, c.ref);
    } catch (e) {
      // One bad RPC answer must not stop the others; the next tick retries from the same `until`.
      log("warn", "deposit_poll_failed", { credential_id: c.id, error: String(e) });
    }
  }
  return credited;
}

async function pollOne(app: AppContext, credentialId: string, reference: string): Promise<number> {
  const [last] = await app.db
    .select({ signature: schema.deposits.signature })
    .from(schema.deposits)
    .where(eq(schema.deposits.credentialId, credentialId))
    .orderBy(desc(schema.deposits.slot), desc(schema.deposits.createdAt))
    .limit(1);
  const found = await app.settlement().findDeposits(reference, last?.signature);
  let n = 0;
  for (const d of found) n += (await credit(app, credentialId, d)) ? 1 : 0;
  await app.db
    .update(schema.requesterCredentials)
    .set({ depositCheckedAt: app.now() })
    .where(eq(schema.requesterCredentials.id, credentialId));
  return n;
}

/** Deposit row + TOPUP in one transaction. A repeated signature is skipped; dust below 0.000001 is dropped. */
async function credit(app: AppContext, credentialId: string, d: ChainDeposit): Promise<boolean> {
  const micro = fromBaseUnits(d.amount, d.asset);
  if (micro <= 0n) return false;
  const amount = fromMicro(micro);
  return app.db.transaction(async (tx) => {
    const ins = await tx
      .insert(schema.deposits)
      .values({
        signature: d.signature,
        credentialId,
        asset: d.asset,
        amount,
        slot: d.slot,
        fromPubkey: d.from,
        createdAt: app.now(),
      })
      .onConflictDoNothing({ target: schema.deposits.signature })
      .returning({ signature: schema.deposits.signature });
    if (!ins.length) return false;
    await tx.insert(schema.requesterLedger).values({
      credentialId,
      entryType: "TOPUP",
      amount,
      asset: d.asset,
      createdAt: app.now(),
    });
    log("info", "deposit_credited", {
      credential_id: credentialId,
      asset: d.asset,
      amount,
      signature: d.signature,
    });
    return true;
  });
}
