// What the site says about the chain, from SOLANA_CLUSTER alone (15 §4.1, 2026-10-13): the network name in
// API responses, explorer links, the public RPC a visitor's browser reads from, and the words on the pages.
// No env schema and no "server-only", so pages, services and scripts can all use it; client components get the
// values as props.
import { CLUSTERS, type Cluster } from "./cluster";

export type Network = (typeof CLUSTERS)[Cluster]["network"];

export function publicCluster(): Cluster {
  return process.env.SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

export interface ClusterText {
  cluster: Cluster;
  /** `network` in API responses: "solana-devnet" or "solana". */
  network: Network;
  /** "Solana Devnet" or "Solana", for prose in either language. */
  chain: string;
  /** " Devnet" or "", to append to "Solana". */
  suffix: string;
  /** The public RPC a visitor's browser may read one account from (/r/{id}). */
  publicRpc: string;
  explorerTx: (sig: string) => string;
  solscanTx: (sig: string) => string;
  /** The USDC mint the pages mention. */
  usdcMint: string;
}

export function clusterText(cluster: Cluster = publicCluster()): ClusterText {
  const c = CLUSTERS[cluster];
  const q = cluster === "devnet" ? "?cluster=devnet" : "";
  return {
    cluster,
    network: c.network,
    chain: cluster === "devnet" ? "Solana Devnet" : "Solana",
    suffix: cluster === "devnet" ? " Devnet" : "",
    publicRpc: cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com",
    explorerTx: (sig) => `https://explorer.solana.com/tx/${sig}${q}`,
    solscanTx: (sig) => `https://solscan.io/tx/${sig}${q}`,
    usdcMint: c.usdcMint,
  };
}
