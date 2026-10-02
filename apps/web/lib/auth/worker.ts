import "server-only";
import { ApiError } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context";

export interface WorkerAuth {
  privyUserId: string;
  /** null until onboarding completes. */
  workerId: string | null;
  status: "active" | "suspended" | null;
}

/** Verify the Privy ACCESS token (identity tokens are rejected by the verifier) (05 §1.2). */
export async function authenticateWorker(app: AppContext, req: Request): Promise<WorkerAuth> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ApiError("UNAUTHENTICATED");
  let userId: string;
  try {
    ({ userId } = await app.identity.verifyAccessToken(token));
  } catch {
    throw new ApiError("UNAUTHENTICATED");
  }
  const [w] = await app.db.select().from(schema.workers).where(eq(schema.workers.privyUserId, userId));
  return {
    privyUserId: userId,
    workerId: w?.id ?? null,
    status: (w?.status as WorkerAuth["status"]) ?? null,
  };
}

/** For every worker API except /me and /onboarding. */
export async function requireWorker(
  app: AppContext,
  req: Request,
): Promise<{ workerId: string; privyUserId: string }> {
  const a = await authenticateWorker(app, req);
  if (!a.workerId) throw new ApiError("WORKER_NOT_ONBOARDED");
  if (a.status !== "active") throw new ApiError("FORBIDDEN", { reason: "worker_suspended" });
  return { workerId: a.workerId, privyUserId: a.privyUserId };
}
