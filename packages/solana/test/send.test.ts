// 16 §7.3: priority fee, compute-unit limit and the resend loop, against a scripted connection.
import { Keypair, SystemProgram, type VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  computeUnitLimit,
  percentile,
  priorityFee,
  type SendConnection,
  sendAndConfirm,
} from "../src/send.ts";

describe("fee and limit", () => {
  it("takes the 75th percentile of recent fees within the floor and ceiling", () => {
    expect(percentile([], 0.75)).toBe(0);
    expect(priorityFee([], 10_000, 1_000_000)).toBe(10_000);
    expect(priorityFee([0, 0, 0, 50_000], 10_000, 1_000_000)).toBe(50_000);
    expect(priorityFee([1, 2, 3, 90_000_000], 10_000, 1_000_000)).toBe(1_000_000);
  });
  it("asks for 20 % over what the simulation used", () => {
    expect(computeUnitLimit(50_000)).toBe(61_000);
    expect(computeUnitLimit(undefined)).toBe(1_400_000);
    expect(computeUnitLimit(1_390_000)).toBe(1_400_000);
  });
});

type Status = { confirmationStatus: "processed" | "confirmed" | "finalized"; err: unknown } | null;

/** A connection whose signature status follows `statuses` (one entry per poll; the last one repeats). */
function fakeConnection(o: {
  statuses: Status[];
  simErr?: unknown;
  units?: number;
  fees?: number[];
  blockHeight?: number;
}) {
  const calls = { sends: 0, polls: 0, simulated: [] as VersionedTransaction[], sent: [] as Uint8Array[] };
  const conn: SendConnection = {
    getLatestBlockhash: async () => ({
      blockhash: "GfVcyD4kkTrj4bKc7WA9sZCin9JDbdT4Zkd3EittNR1W",
      lastValidBlockHeight: 100,
    }),
    getRecentPrioritizationFees: async () =>
      (o.fees ?? []).map((prioritizationFee, slot) => ({ slot, prioritizationFee })),
    simulateTransaction: (async (tx: VersionedTransaction) => {
      calls.simulated.push(tx);
      return {
        context: { slot: 1 },
        value: { err: o.simErr ?? null, logs: [], unitsConsumed: o.units ?? 30_000 },
      };
    }) as SendConnection["simulateTransaction"],
    sendRawTransaction: async (raw) => {
      calls.sends++;
      calls.sent.push(Uint8Array.from(raw as Uint8Array));
      return "sig";
    },
    getSignatureStatuses: (async () => {
      const s = o.statuses[Math.min(calls.polls, o.statuses.length - 1)] ?? null;
      calls.polls++;
      return { context: { slot: 1 }, value: [s] };
    }) as SendConnection["getSignatureStatuses"],
    getBlockHeight: async () => o.blockHeight ?? 50,
  };
  return { conn, calls };
}

/** A clock the sleeps advance, so a 60 s wait runs instantly. */
function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

const payer = Keypair.generate();
const ix = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: Keypair.generate().publicKey,
  lamports: 1,
});
const opts = (c: ReturnType<typeof clock>, commitment: "confirmed" | "finalized" = "finalized") => ({
  commitment,
  timeoutMs: 60_000,
  minPriorityMicroLamports: 10_000,
  maxPriorityMicroLamports: 1_000_000,
  ...c,
});

describe("sendAndConfirm", () => {
  it("records the signature before sending, resends every 2 s and returns at finalized", async () => {
    const { conn, calls } = fakeConnection({
      statuses: [
        null,
        null,
        null,
        { confirmationStatus: "confirmed", err: null },
        { confirmationStatus: "finalized", err: null },
      ],
    });
    const recorded: string[] = [];
    const r = await sendAndConfirm(
      conn,
      payer.publicKey,
      [ix],
      [payer],
      async (s) => {
        recorded.push(s);
        expect(calls.sends).toBe(0);
      },
      opts(clock()),
    );
    expect(r).toEqual({ ok: true, signature: recorded[0] });
    // polls at 0,1,2,3,4 s; sends at 0, 2 and 4 s
    expect(calls.sends).toBe(3);
    // every resend is the same signed bytes, so it can never run twice
    expect(new Set(calls.sent.map((b) => Buffer.from(b).toString("hex"))).size).toBe(1);
  });

  it("returns at confirmed when that is all it waits for", async () => {
    const { conn, calls } = fakeConnection({ statuses: [{ confirmationStatus: "confirmed", err: null }] });
    const r = await sendAndConfirm(
      conn,
      payer.publicKey,
      [ix],
      [payer],
      async () => undefined,
      opts(clock(), "confirmed"),
    );
    expect(r.ok).toBe(true);
    expect(calls.polls).toBe(1);
  });

  it("does not sign or record anything when the simulation fails", async () => {
    const { conn, calls } = fakeConnection({
      statuses: [null],
      simErr: { InstructionError: [0, { Custom: 6001 }] },
    });
    let recorded = false;
    const r = await sendAndConfirm(
      conn,
      payer.publicKey,
      [ix],
      [payer],
      async () => {
        recorded = true;
      },
      opts(clock()),
    );
    expect(r).toMatchObject({ ok: false, signature: null });
    expect(recorded).toBe(false);
    expect(calls.sends).toBe(0);
  });

  it("reports a failed transaction", async () => {
    const { conn } = fakeConnection({
      statuses: [{ confirmationStatus: "confirmed", err: { InstructionError: [2, "x"] } }],
    });
    const r = await sendAndConfirm(
      conn,
      payer.publicKey,
      [ix],
      [payer],
      async () => undefined,
      opts(clock()),
    );
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("tx error") });
  });

  it("gives up once the blockhash has expired and nothing landed", async () => {
    const { conn } = fakeConnection({ statuses: [null], blockHeight: 101 });
    const r = await sendAndConfirm(
      conn,
      payer.publicKey,
      [ix],
      [payer],
      async () => undefined,
      opts(clock()),
    );
    expect(r).toMatchObject({ ok: false, error: "blockhash expired" });
  });

  it("keeps waiting past expiry for a transaction that already landed, up to the timeout", async () => {
    const { conn } = fakeConnection({
      statuses: [{ confirmationStatus: "confirmed", err: null }],
      blockHeight: 101,
    });
    const r = await sendAndConfirm(
      conn,
      payer.publicKey,
      [ix],
      [payer],
      async () => undefined,
      opts(clock()),
    );
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("not finalized within timeout") });
  });

  it("sets the compute-unit limit from the simulation and the price from recent fees", async () => {
    const { conn, calls } = fakeConnection({
      statuses: [{ confirmationStatus: "finalized", err: null }],
      units: 40_000,
      fees: [0, 20_000, 30_000, 70_000],
    });
    await sendAndConfirm(conn, payer.publicKey, [ix], [payer], async () => undefined, opts(clock()));
    const { VersionedTransaction } = await import("@solana/web3.js");
    const sent = VersionedTransaction.deserialize(calls.sent[0] as Uint8Array);
    const budget = sent.message.compiledInstructions.slice(0, 2).map((c) => Buffer.from(c.data));
    expect(budget[0]?.readUInt8(0)).toBe(2); // SetComputeUnitLimit
    expect(budget[0]?.readUInt32LE(1)).toBe(49_000);
    expect(budget[1]?.readUInt8(0)).toBe(3); // SetComputeUnitPrice
    expect(Number(budget[1]?.readBigUInt64LE(1))).toBe(70_000);
  });
});
