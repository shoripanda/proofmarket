import "server-only";

export interface WorkerAuth {
  privyUserId: string;
  /** null until onboarding completes (WORKER_NOT_ONBOARDED for other worker APIs). */
  workerId: string | null;
}

/** Verify the Privy ACCESS token (not identity token) with @privy-io/node (05 §1.2). PR-05. */
export async function authenticateWorker(_req: Request): Promise<WorkerAuth> {
  throw new Error("NOT_IMPLEMENTED: authenticateWorker (PR-05)");
}

/** Server-side lookup of the user's Solana embedded wallet address. Never trust a client-sent address. PR-05. */
export async function fetchPayoutAddress(_privyUserId: string): Promise<string> {
  throw new Error("NOT_IMPLEMENTED: fetchPayoutAddress (PR-05)");
}
