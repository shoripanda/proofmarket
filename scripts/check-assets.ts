// Compare the asset registry (packages/core/src/domain/assets.ts) with mainnet (16 §3.1). Run before adding a
// row and before deploying the program; exits 1 on any mismatch. Read-only.
//   run check-assets.ts [--url https://api.mainnet-beta.solana.com]
// Checks per mint: it exists, its owner is the token program the registry names, its decimals match, and a
// Token-2022 mint carries only extensions program v1.3 accepts (16 §5.2), with a zero fee and no hook program.
import { ASSETS, type AssetInfo } from "@proofmarket/core";
import { Connection, type ParsedAccountData, PublicKey } from "@solana/web3.js";
import { args } from "./lib.ts";

const OWNERS: Record<AssetInfo["tokenProgram"], string> = {
  "spl-token": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "token-2022": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
};
/** 16 §5.2: extensions that cannot hold escrowed funds back. Fee and hook are allowed only when empty. */
const ALLOWED = new Set([
  "metadataPointer",
  "tokenMetadata",
  "groupPointer",
  "groupMemberPointer",
  "tokenGroup",
  "tokenGroupMember",
  "mintCloseAuthority",
  "confidentialTransferMint",
  "confidentialTransferFeeConfig",
  "permanentDelegate",
  "transferFeeConfig",
  "transferHook",
  "pausableConfig",
]);

type Ext = { extension: string; state?: Record<string, unknown> };
type Fee = { transferFeeBasisPoints?: number; maximumFee?: number };

export function extensionProblems(exts: Ext[]): string[] {
  const out: string[] = [];
  for (const e of exts) {
    if (!ALLOWED.has(e.extension)) out.push(`extension ${e.extension} is not accepted`);
    if (e.extension === "transferFeeConfig") {
      for (const k of ["olderTransferFee", "newerTransferFee"]) {
        const f = (e.state?.[k] ?? {}) as Fee;
        if (f.transferFeeBasisPoints || f.maximumFee) out.push(`${k} is not zero`);
      }
    }
    if (e.extension === "transferHook" && e.state?.programId) out.push("transfer hook program is set");
  }
  return out;
}

const a = args();
const conn = new Connection(String(a.url ?? "https://api.mainnet-beta.solana.com"), "confirmed");
let bad = 0;
for (const asset of ASSETS as readonly AssetInfo[]) {
  if (!asset.mainnetMint) continue;
  const info = await conn.getParsedAccountInfo(new PublicKey(asset.mainnetMint));
  const problems: string[] = [];
  const v = info.value;
  if (!v) problems.push("mint not found");
  else {
    if (v.owner.toBase58() !== OWNERS[asset.tokenProgram])
      problems.push(`owner ${v.owner.toBase58()} is not ${asset.tokenProgram}`);
    const parsed = (v.data as ParsedAccountData).parsed?.info as
      | { decimals?: number; extensions?: Ext[] }
      | undefined;
    if (asset.native) {
      if (parsed?.decimals !== undefined && parsed.decimals !== asset.decimals)
        problems.push("decimals differ");
    } else {
      if (parsed?.decimals !== asset.decimals)
        problems.push(`decimals ${parsed?.decimals} on chain, ${asset.decimals} in the registry`);
      problems.push(...extensionProblems(parsed?.extensions ?? []));
    }
  }
  bad += problems.length ? 1 : 0;
  console.log(
    `${problems.length ? "NG" : "ok"}  ${asset.symbol.padEnd(8)} ${asset.mainnetMint}${problems.length ? `  ${problems.join("; ")}` : ""}`,
  );
  await new Promise((r) => setTimeout(r, 300)); // the public RPC rate-limits bursts
}
if (bad) {
  console.error(`${bad} asset(s) do not match the chain`);
  process.exit(1);
}
