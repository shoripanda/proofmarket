// In-memory stand-in for the Solana program behind the SettlementAdapter contract (06 §3-5).
import type {
  ChainResult,
  FinalizeAndSettleInput,
  FundTaskInput,
  OnChainTask,
  RefundInput,
  SettlementAdapter,
  X402Facilitator,
} from "@proofmarket/solana";
import { createOfflineX402Facilitator } from "@proofmarket/solana";
import type { VersionedTransaction } from "@proofmarket/solana/web3";

type Mode = "ok" | "retry" | "halt" | "land-but-timeout";

export class FakeChain implements SettlementAdapter {
  tasks = new Map<string, OnChainTask>();
  sent: { op: string; sig: string }[] = [];
  /** Queue of modes consumed per call; default "ok". */
  modes: Mode[] = [];
  private n = 0;

  private key = (h: Uint8Array) => Buffer.from(h).toString("hex");
  private sig = (op: string) => {
    const s = `${op}Sig${++this.n}`.padEnd(64, "1");
    this.sent.push({ op, sig: s });
    return s;
  };
  private mode(): Mode {
    return this.modes.shift() ?? "ok";
  }

  async assertSafeToStart() {}
  async readTask(h: Uint8Array) {
    return this.tasks.get(this.key(h)) ?? null;
  }
  async balances() {
    return { operatorLamports: 5_000_000_000n, treasuryAmount: 1_000_000_000n };
  }

  async fundTask(i: FundTaskInput, onSigned: (s: string) => Promise<void>): Promise<ChainResult> {
    const k = this.key(i.taskIdHash);
    const taskAccount = `Task${k.slice(0, 40)}`;
    if (this.tasks.has(k)) return { kind: "confirmed", signature: null, alreadyDone: true, taskAccount };
    const m = this.mode();
    if (m === "halt") return { kind: "halt", error: "halted" };
    const s = this.sig("fund");
    await onSigned(s);
    if (m === "retry") return { kind: "retry", signature: s, error: "blockhash expired" };
    this.tasks.set(k, {
      address: taskAccount,
      status: "Funded",
      outcome: "None",
      amountPerWitness: i.amountPerWitness,
      requiredWitnesses: i.requiredWitnesses,
      quorum: i.quorum,
      deadline: Math.floor(i.deadline.getTime() / 1000),
      evidenceRoot: new Uint8Array(32),
      resultHash: new Uint8Array(32),
      recipients: [],
      paidTotal: 0n,
    });
    if (m === "land-but-timeout") return { kind: "retry", signature: s, error: "not finalized in 60s" };
    return { kind: "confirmed", signature: s, alreadyDone: false, taskAccount };
  }

  async finalizeAndSettle(
    i: FinalizeAndSettleInput,
    onSigned: (s: string) => Promise<void>,
  ): Promise<ChainResult> {
    const k = this.key(i.taskIdHash);
    const t = this.tasks.get(k);
    if (!t) return { kind: "halt", error: "task account missing" };
    if (t.status === "Settled")
      return { kind: "confirmed", signature: null, alreadyDone: true, taskAccount: t.address };
    if (t.status === "Refunded") return { kind: "halt", error: "task already refunded" };
    if (
      t.status === "Finalized" &&
      (t.recipients.join() !== i.recipients.join() ||
        Buffer.compare(Buffer.from(t.evidenceRoot), Buffer.from(i.evidenceRoot)) !== 0)
    ) {
      return { kind: "halt", error: "on-chain finalize differs from DB" };
    }
    const m = this.mode();
    if (m === "halt") return { kind: "halt", error: "halted" };
    const s = this.sig("settle");
    await onSigned(s);
    if (m === "retry") return { kind: "retry", signature: s, error: "rpc down" };
    t.status = "Settled";
    t.recipients = i.recipients;
    t.evidenceRoot = i.evidenceRoot;
    t.paidTotal = t.amountPerWitness * BigInt(i.recipients.length);
    return { kind: "confirmed", signature: s, alreadyDone: false, taskAccount: t.address };
  }

  async refund(i: RefundInput, onSigned: (s: string) => Promise<void>): Promise<ChainResult> {
    const t = this.tasks.get(this.key(i.taskIdHash));
    if (!t) return { kind: "halt", error: "task account missing" };
    if (t.status === "Refunded")
      return { kind: "confirmed", signature: null, alreadyDone: true, taskAccount: t.address };
    if (t.status !== "Funded") return { kind: "halt", error: `cannot refund ${t.status}` };
    const m = this.mode();
    const s = this.sig("refund");
    await onSigned(s);
    if (m === "retry") return { kind: "retry", signature: s, error: "rpc down" };
    t.status = "Refunded";
    return { kind: "confirmed", signature: s, alreadyDone: false, taskAccount: t.address };
  }
}

/** x402 facilitator over the offline one (co-signs, never sends), with a switch for chain-side failures. */
export class FakeX402 implements X402Facilitator {
  /** Base seed of the fee payer; tests build payments against `feePayer`. */
  private inner = createOfflineX402Facilitator({
    appEnv: "test",
    operatorSeed: new Uint8Array(32).fill(9),
    bountyMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  });
  readonly network = this.inner.network;
  readonly asset = this.inner.asset;
  readonly payTo = this.inner.payTo;
  readonly feePayer = this.inner.feePayer;
  readonly decimals = this.inner.decimals;
  /** Source token accounts that "exist". Empty = every account exists. */
  existing = new Set<string>();
  settleMode: "ok" | "fail" = "ok";
  settled: string[] = [];

  async accountExists(address: string) {
    return this.existing.size === 0 || this.existing.has(address);
  }
  signatureOf(tx: VersionedTransaction) {
    return this.inner.signatureOf(tx);
  }
  async settle(tx: VersionedTransaction) {
    if (this.settleMode === "fail") return { ok: false as const, error: "simulated failure" };
    const r = await this.inner.settle(tx);
    if (r.ok) this.settled.push(r.signature);
    return r;
  }
}
