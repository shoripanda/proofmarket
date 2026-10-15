// The signing boundary (docs/architecture 05 §4.1): everything that moves money asks a Signer for a signature
// over a message's bytes and never touches a secret key itself. The first backend wraps a Keypair from the
// environment (the same behaviour as before); a KMS / MPC backend plugs in here without changing the adapter.

import { Keypair, type PublicKey, type Transaction, VersionedTransaction } from "@solana/web3.js";

export interface Signer {
  readonly publicKey: PublicKey;
  /** Signs the serialized message (not the whole transaction). Returns the 64-byte ed25519 signature. */
  sign(message: Uint8Array): Promise<Uint8Array>;
}

/** The in-process backend: a Keypair held in memory (OPERATOR_SECRET_KEY / VERIFIER_SECRET_KEY). */
export function keypairSigner(secretKey: Uint8Array | Keypair): Signer {
  const kp = secretKey instanceof Keypair ? secretKey : Keypair.fromSecretKey(secretKey);
  return {
    publicKey: kp.publicKey,
    async sign(message) {
      // web3.js signs a VersionedTransaction by signing its compiled message; do the same for one message.
      const tx = new VersionedTransaction(deserializeMessage(message));
      tx.sign([kp]);
      const i = tx.message.staticAccountKeys.findIndex((k) => k.equals(kp.publicKey));
      const sig = tx.signatures[i];
      if (!sig || i < 0) throw new Error(`${kp.publicKey.toBase58()} is not a signer of this message`);
      return sig;
    },
  };
}

function deserializeMessage(message: Uint8Array) {
  // VersionedMessage.deserialize handles both legacy and v0 messages.
  return VersionedTransaction.deserialize(withEmptySignatures(message)).message;
}

/** Prefix a bare message with its (empty) signature array so it deserializes as a transaction. */
function withEmptySignatures(message: Uint8Array): Uint8Array {
  const n = numRequiredSignatures(message);
  const out = new Uint8Array(1 + 64 * n + message.length);
  out[0] = n;
  out.set(message, 1 + 64 * n);
  return out;
}

/** The header's first byte (after the v0 version prefix, if any) is numRequiredSignatures. */
function numRequiredSignatures(message: Uint8Array): number {
  const first = message[0] ?? 0;
  // A v0 message starts with 0x80 | version; a legacy message starts with the header byte itself (< 0x80).
  return first & 0x80 ? (message[1] ?? 0) : first;
}

/** Add each signer's signature to a built transaction (the way `tx.sign([...keypairs])` would). */
export async function signTransaction(tx: VersionedTransaction, signers: readonly Signer[]): Promise<void> {
  const message = tx.message.serialize();
  for (const s of signers) tx.addSignature(s.publicKey, await s.sign(message));
}

/**
 * Minimal Anchor wallet over a Signer. `Wallet` is only exported from the CJS build of @anchor-lang/core, so
 * bundlers that pick the ESM build (Next.js) cannot import it; this only satisfies Provider, and the adapter
 * signs its own transactions through sendAndConfirm.
 */
export function signerWallet(signer: Signer) {
  const signOne = async <T extends VersionedTransaction | Transaction>(tx: T): Promise<T> => {
    if (tx instanceof VersionedTransaction) await signTransaction(tx, [signer]);
    else tx.addSignature(signer.publicKey, Buffer.from(await signer.sign(tx.serializeMessage())));
    return tx;
  };
  return {
    publicKey: signer.publicKey,
    signTransaction: signOne,
    async signAllTransactions<T extends VersionedTransaction | Transaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) await signOne(tx);
      return txs;
    },
  };
}
