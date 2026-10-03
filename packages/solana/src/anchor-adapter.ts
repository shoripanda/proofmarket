// Real SettlementAdapter over @anchor-lang/core + web3.js v1 (06 §4-5).
// Every method reads the Task account first and only sends what the on-chain state still needs.

import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionExpiredBlockheightExceededError,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import idl from "../idl/proofmarket.json" with { type: "json" };
import type { Proofmarket } from "../idl/proofmarket.ts";
import type {
  ChainResult,
  FinalizeAndSettleInput,
  FundTaskInput,
  OnChainOutcome,
  OnChainTask,
  OnChainTaskStatus,
  RefundInput,
  SettlementAdapter,
} from "./adapter.ts";
import { configPda, taskPda, vaultPda } from "./pda.ts";

export interface AnchorAdapterConfig {
  rpcUrl: string;
  expectedGenesisHash: string;
  programId: string;
  bountyMint: string;
  operatorSecretKey: Uint8Array;
  verifierSecretKey: Uint8Array;
  /** Max wait for `finalized` before reporting retry (06 §5.1). */
  confirmTimeoutMs?: number;
  priorityMicroLamports?: number;
}

const variant = (o: Record<string, unknown>) => Object.keys(o)[0] ?? "";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const OUTCOME_ARG: Record<FinalizeAndSettleInput["outcome"], Record<string, Record<string, never>>> = {
  VERIFIED: { verified: {} },
  REJECTED: { noConsensus: {} },
  EXPIRED: { insufficientWitnesses: {} },
};
const OUTCOME_NAME: Record<FinalizeAndSettleInput["outcome"], OnChainOutcome> = {
  VERIFIED: "Verified",
  REJECTED: "NoConsensus",
  EXPIRED: "InsufficientWitnesses",
};

export function createAnchorAdapter(cfg: AnchorAdapterConfig): SettlementAdapter {
  const connection = new Connection(cfg.rpcUrl, { commitment: "confirmed" });
  const operator = Keypair.fromSecretKey(cfg.operatorSecretKey);
  const verifier = Keypair.fromSecretKey(cfg.verifierSecretKey);
  const programId = new PublicKey(cfg.programId);
  const mint = new PublicKey(cfg.bountyMint);
  const provider = new AnchorProvider(connection, keypairWallet(operator), { commitment: "confirmed" });
  const program = new Program<Proofmarket>(
    { ...(idl as Proofmarket), address: programId.toBase58() },
    provider,
  );
  const [config] = configPda(programId);
  const treasury = getAssociatedTokenAddressSync(mint, operator.publicKey);
  const timeoutMs = cfg.confirmTimeoutMs ?? 60_000;
  let checked = false;

  async function readTask(taskIdHash: Uint8Array): Promise<OnChainTask | null> {
    const [address] = taskPda(programId, taskIdHash);
    const t = await program.account.task.fetchNullable(address, "confirmed");
    if (!t) return null;
    return {
      address: address.toBase58(),
      status: cap(variant(t.status)) as OnChainTaskStatus,
      outcome: cap(variant(t.outcome)) as OnChainOutcome,
      amountPerWitness: BigInt(t.amountPerWitness.toString()),
      requiredWitnesses: t.requiredWitnesses,
      quorum: t.quorum,
      deadline: Number(t.deadline.toString()),
      evidenceRoot: Uint8Array.from(t.evidenceRoot),
      resultHash: Uint8Array.from(t.resultHash),
      recipients: t.recipients.slice(0, t.recipientCount).map((p) => p.toBase58()),
      paidTotal: BigInt(t.paidTotal.toString()),
    };
  }

  /** Sign, report the signature, send, wait for `finalized` within timeoutMs. */
  async function send(
    ixs: TransactionInstruction[],
    signers: Keypair[],
    onSigned: (sig: string) => Promise<void>,
  ): Promise<{ ok: true; signature: string } | { ok: false; signature: string | null; error: string }> {
    const latest = await connection.getLatestBlockhash("finalized");
    const msg = new TransactionMessage({
      payerKey: operator.publicKey,
      recentBlockhash: latest.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cfg.priorityMicroLamports ?? 10_000 }),
        ...ixs,
      ],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign(signers);
    const signature = bs58encode(tx.signatures[0] ?? new Uint8Array());
    await onSigned(signature); // record BEFORE sending (06 §5.1 step 2)
    try {
      await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      const confirm = connection.confirmTransaction({ signature, ...latest }, "finalized");
      const timer = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("not finalized within timeout")), timeoutMs),
      );
      const res = await Promise.race([confirm, timer]);
      if (res.value.err) return { ok: false, signature, error: `tx error: ${JSON.stringify(res.value.err)}` };
      return { ok: true, signature };
    } catch (e) {
      if (e instanceof TransactionExpiredBlockheightExceededError)
        return { ok: false, signature, error: "blockhash expired" };
      return { ok: false, signature, error: String(e).slice(0, 300) };
    }
  }

  const confirmed = (signature: string | null, taskAccount: string, alreadyDone = false): ChainResult => ({
    kind: "confirmed",
    signature,
    alreadyDone,
    taskAccount,
  });

  return {
    async assertSafeToStart() {
      if (checked) return;
      const genesis = await connection.getGenesisHash();
      if (genesis !== cfg.expectedGenesisHash)
        throw new Error(`refusing to start: genesis ${genesis} is not the expected cluster`);
      const c = await program.account.config.fetch(config);
      if (!c.operator.equals(operator.publicKey))
        throw new Error("config.operator does not match OPERATOR_SECRET_KEY");
      if (!c.verifier.equals(verifier.publicKey))
        throw new Error("config.verifier does not match VERIFIER_SECRET_KEY");
      if (!c.bountyMint.equals(mint)) throw new Error("config.bounty_mint does not match BOUNTY_MINT");
      if (!c.treasury.equals(treasury)) throw new Error("config.treasury is not the operator's ATA");
      checked = true;
    },

    readTask,

    async balances() {
      const lamports = await connection.getBalance(operator.publicKey, "confirmed");
      const bal = await connection.getTokenAccountBalance(treasury, "confirmed").catch(() => null);
      return { operatorLamports: BigInt(lamports), treasuryAmount: BigInt(bal?.value.amount ?? "0") };
    },

    async fundTask(i: FundTaskInput, onSigned) {
      await this.assertSafeToStart();
      const [task] = taskPda(programId, i.taskIdHash);
      if (await readTask(i.taskIdHash)) return confirmed(null, task.toBase58(), true);
      const ix = await program.methods
        .initializeTask({
          taskIdHash: Array.from(i.taskIdHash),
          requesterRefHash: Array.from(i.requesterRefHash),
          amountPerWitness: new BN(i.amountPerWitness.toString()),
          requiredWitnesses: i.requiredWitnesses,
          quorum: i.quorum,
          deadline: new BN(Math.floor(i.deadline.getTime() / 1000)),
        })
        .accountsPartial({
          operator: operator.publicKey,
          config,
          task,
          mint,
          vault: vaultPda(programId, task)[0],
          treasury,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      const r = await send([ix], [operator], onSigned);
      if (r.ok) return confirmed(r.signature, task.toBase58());
      // A timed-out send may still have landed: report retry; the job re-reads the PDA next time.
      return { kind: "retry", signature: r.signature, error: r.error };
    },

    async finalizeAndSettle(i: FinalizeAndSettleInput, onSigned) {
      await this.assertSafeToStart();
      const [task] = taskPda(programId, i.taskIdHash);
      const onChain = await readTask(i.taskIdHash);
      if (!onChain) return { kind: "halt", error: "task account missing" };
      if (onChain.status === "Settled") return confirmed(null, task.toBase58(), true);
      if (onChain.status === "Refunded") return { kind: "halt", error: "task already refunded" };
      if (onChain.status === "Finalized") {
        const same =
          onChain.outcome === OUTCOME_NAME[i.outcome] &&
          Buffer.compare(Buffer.from(onChain.evidenceRoot), Buffer.from(i.evidenceRoot)) === 0 &&
          Buffer.compare(Buffer.from(onChain.resultHash), Buffer.from(i.resultHash)) === 0 &&
          onChain.recipients.join(",") === i.recipients.join(",");
        if (!same) return { kind: "halt", error: "on-chain finalize differs from DB (I-SET-05)" };
      }
      const recipients = i.recipients.map((r) => new PublicKey(r));
      const atas = recipients.map((r) => getAssociatedTokenAddressSync(mint, r));
      // Create missing ATAs in their own tx (06 §4: keeps the settle tx small).
      const infos = await connection.getMultipleAccountsInfo(atas, "confirmed");
      const missing = atas
        .map((ata, k) => ({ ata, owner: recipients[k] as PublicKey, exists: infos[k] !== null }))
        .filter((x) => !x.exists);
      if (missing.length) {
        const ataIxs = missing.map((m) =>
          createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, m.ata, m.owner, mint),
        );
        const r = await send(ataIxs, [operator], async () => undefined);
        if (!r.ok) return { kind: "retry", signature: null, error: `ata: ${r.error}` };
      }
      const ixs: TransactionInstruction[] = [];
      if (onChain.status === "Funded") {
        ixs.push(
          await program.methods
            .finalizeVerification({
              outcome: OUTCOME_ARG[i.outcome] as never,
              evidenceRoot: Array.from(i.evidenceRoot),
              resultHash: Array.from(i.resultHash),
              recipients,
            })
            .accountsPartial({ verifier: verifier.publicKey, config, task })
            .instruction(),
        );
      }
      ixs.push(
        await program.methods
          .settle()
          .accountsPartial({
            operator: operator.publicKey,
            config,
            task,
            mint,
            vault: vaultPda(programId, task)[0],
            treasury,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts(atas.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })))
          .instruction(),
      );
      const signers = onChain.status === "Funded" ? [operator, verifier] : [operator];
      const r = await send(ixs, signers, onSigned);
      if (r.ok) return confirmed(r.signature, task.toBase58());
      return { kind: "retry", signature: r.signature, error: r.error };
    },

    async refund(i: RefundInput, onSigned) {
      await this.assertSafeToStart();
      const [task] = taskPda(programId, i.taskIdHash);
      const onChain = await readTask(i.taskIdHash);
      if (!onChain) return { kind: "halt", error: "task account missing" };
      if (onChain.status === "Refunded") return confirmed(null, task.toBase58(), true);
      if (onChain.status !== "Funded")
        return { kind: "halt", error: `refusing to refund a ${onChain.status} task` };
      const ix = await program.methods
        .refund(i.reason === "Cancelled" ? { cancelled: {} } : ({ expired: {} } as never))
        .accountsPartial({
          operator: operator.publicKey,
          config,
          task,
          vault: vaultPda(programId, task)[0],
          treasury,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      const r = await send([ix], [operator], onSigned);
      if (r.ok) return confirmed(r.signature, task.toBase58());
      return { kind: "retry", signature: r.signature, error: r.error };
    },
  };
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/**
 * Minimal Anchor wallet. `Wallet` is only exported from the CJS build of @anchor-lang/core, so bundlers that
 * pick the ESM build (Next.js) cannot import it. We sign transactions ourselves; this only satisfies Provider.
 */
function keypairWallet(kp: Keypair) {
  return {
    publicKey: kp.publicKey,
    payer: kp,
    async signTransaction<T extends VersionedTransaction | import("@solana/web3.js").Transaction>(
      tx: T,
    ): Promise<T> {
      if (tx instanceof VersionedTransaction) tx.sign([kp]);
      else tx.partialSign(kp);
      return tx;
    },
    async signAllTransactions<T extends VersionedTransaction | import("@solana/web3.js").Transaction>(
      txs: T[],
    ): Promise<T[]> {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) tx.sign([kp]);
        else tx.partialSign(kp);
      }
      return txs;
    },
  };
}
