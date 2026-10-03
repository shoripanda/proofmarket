import "server-only";
import { ApiError } from "@proofmarket/core";
import { AdminFlagRequestSchema } from "@proofmarket/core/schemas/api";
import { authenticateCron, authenticateOperator } from "../auth/operator";
import type { AppContext } from "../context";
import { readJson } from "../http";
import {
  requeueJob,
  revokeCredential,
  revokeEvidenceAccess,
  setFlag,
  suspendCredential,
  suspendWorker,
} from "../services/admin-service";
import { tick } from "../services/jobs";

export interface OperatorSecrets {
  adminToken: string;
  cronSecret: string;
}
const ok = () => Response.json({ ok: true });

export async function handleSetFlag(app: AppContext, s: OperatorSecrets, req: Request) {
  const by = authenticateOperator(req, s.adminToken);
  const r = AdminFlagRequestSchema.safeParse(await readJson(req));
  if (!r.success) throw new ApiError("VALIDATION_FAILED");
  await setFlag(app.db, r.data.key, r.data.value, by);
  return ok();
}
export async function handleSuspendCredential(app: AppContext, s: OperatorSecrets, req: Request, id: string) {
  await suspendCredential(app.db, id, authenticateOperator(req, s.adminToken));
  return ok();
}
export async function handleRevokeCredential(app: AppContext, s: OperatorSecrets, req: Request, id: string) {
  await revokeCredential(app.db, id, authenticateOperator(req, s.adminToken), app.now());
  return ok();
}
export async function handleSuspendWorker(app: AppContext, s: OperatorSecrets, req: Request, id: string) {
  await suspendWorker(app.db, id, authenticateOperator(req, s.adminToken), app.now());
  return ok();
}
export async function handleRevokeEvidence(app: AppContext, s: OperatorSecrets, req: Request, id: string) {
  await revokeEvidenceAccess(app.db, id, authenticateOperator(req, s.adminToken));
  return ok();
}
export async function handleRequeue(app: AppContext, s: OperatorSecrets, req: Request, id: string) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new ApiError("VALIDATION_FAILED");
  await requeueJob(app.db, n, authenticateOperator(req, s.adminToken), app.now());
  return ok();
}
export async function handleTick(app: AppContext, s: OperatorSecrets, req: Request) {
  authenticateCron(req, s.cronSecret);
  return Response.json(await tick(app));
}
