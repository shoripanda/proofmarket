// In-memory stand-in for the Solana program behind the SettlementAdapter contract (06 §3-5).
import type {
  ChainResult,
  FinalizeAndSettleInput,
  FundTaskInput,
  OnChainTask,
  RefundInput,
  SettlementAdapter,
} from "@proofmarket/solana";

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
