// Generates packages/core/openapi.json from the zod schemas. Run: pnpm openapi
// The endpoint list mirrors 05-api-design.md §1.1. CI checks the committed file is up to date.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as S from "../schemas/api.ts";

type Auth = "requester" | "worker" | "operator" | "none";
interface Endpoint {
  method: "get" | "post" | "delete";
  path: string;
  auth: Auth;
  priority: "P0" | "P1" | "Stretch";
  summary: string;
  idempotent?: boolean;
  query?: z.ZodType;
  body?: z.ZodType;
  ok: { status: number; schema: z.ZodType | null };
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "post",
    path: "/v1/verifications",
    auth: "requester",
    priority: "P0",
    idempotent: true,
    summary: "Create a verification request",
    body: S.CreateVerificationRequestSchema,
    ok: { status: 201, schema: S.CreateVerificationResponseSchema },
  },
  {
    method: "get",
    path: "/v1/verifications/{id}",
    auth: "requester",
    priority: "P0",
    summary: "Get verification state and result",
    ok: { status: 200, schema: S.GetVerificationResponseSchema },
  },
  {
    method: "post",
    path: "/v1/verifications/{id}/cancel",
    auth: "requester",
    priority: "P0",
    summary: "Cancel (only with no active claim and no valid submission)",
    ok: { status: 200, schema: S.GetVerificationResponseSchema },
  },
  {
    method: "get",
    path: "/v1/verifications/{id}/evidence",
    auth: "requester",
    priority: "P1",
    summary: "Signed URLs of EXIF-stripped derived images",
    ok: { status: 200, schema: S.EvidenceUrlsResponseSchema },
  },
  {
    method: "post",
    path: "/v1/verifications/{id}/dispute",
    auth: "requester",
    priority: "Stretch",
    summary: "Dispute a result once within 24 h; creates a recheck task you pay for",
    body: S.DisputeRequestSchema,
    ok: { status: 201, schema: S.DisputeResponseSchema },
  },
  {
    method: "post",
    path: "/v1/schedules",
    auth: "requester",
    priority: "Stretch",
    summary: "Create a recurring check (a normal verification is created at each time, Japan time)",
    body: S.CreateScheduleRequestSchema,
    ok: { status: 201, schema: S.ScheduleSchema },
  },
  {
    method: "get",
    path: "/v1/schedules",
    auth: "requester",
    priority: "Stretch",
    summary: "List recurring checks of this API key",
    ok: { status: 200, schema: S.ScheduleListResponseSchema },
  },
  {
    method: "delete",
    path: "/v1/schedules/{id}",
    auth: "requester",
    priority: "Stretch",
    summary: "Stop a recurring check",
    ok: { status: 200, schema: S.ScheduleSchema },
  },
  {
    method: "get",
    path: "/v1/worker/me",
    auth: "worker",
    priority: "P0",
    summary: "Current worker",
    ok: { status: 200, schema: S.WorkerMeResponseSchema },
  },
  {
    method: "post",
    path: "/v1/worker/onboarding",
    auth: "worker",
    priority: "P0",
    summary: "Redeem invite code and record consents",
    body: S.OnboardingRequestSchema,
    ok: { status: 200, schema: S.WorkerMeResponseSchema },
  },
  {
    method: "get",
    path: "/v1/worker/tasks",
    auth: "worker",
    priority: "P0",
    summary: "Eligible open tasks near (rounded) location",
    query: S.WorkerTaskQuerySchema,
    ok: { status: 200, schema: S.WorkerTaskListResponseSchema },
  },
  {
    method: "get",
    path: "/v1/worker/tasks/{id}",
    auth: "worker",
    priority: "P0",
    summary: "Task detail",
    ok: { status: 200, schema: S.WorkerTaskSchema },
  },
  {
    method: "post",
    path: "/v1/worker/tasks/{id}/claim",
    auth: "worker",
    priority: "P0",
    summary: "Claim a witness slot",
    ok: { status: 201, schema: S.ClaimResponseSchema },
  },
  {
    method: "post",
    path: "/v1/worker/claims/{claim_id}/challenge",
    auth: "worker",
    priority: "P0",
    summary: "Issue a fresh nonce (supersedes the previous one)",
    ok: { status: 201, schema: S.ChallengeResponseSchema },
  },
  {
    method: "post",
    path: "/v1/worker/claims/{claim_id}/uploads",
    auth: "worker",
    priority: "P0",
    summary: "Signed upload URL bound to claim and challenge",
    body: S.CreateUploadRequestSchema,
    ok: { status: 201, schema: S.CreateUploadResponseSchema },
  },
  {
    method: "post",
    path: "/v1/worker/tasks/{id}/evidence",
    auth: "worker",
    priority: "P0",
    idempotent: true,
    summary: "Submit evidence; check outcome is returned in a 200 body",
    body: S.SubmitEvidenceRequestSchema,
    ok: { status: 200, schema: S.SubmitEvidenceResponseSchema },
  },
  {
    method: "post",
    path: "/v1/worker/claims/{claim_id}/abandon",
    auth: "worker",
    priority: "P0",
    summary: "Abandon a claim",
    ok: { status: 200, schema: S.ClaimDetailResponseSchema },
  },
  {
    method: "get",
    path: "/v1/worker/claims/{claim_id}",
    auth: "worker",
    priority: "P0",
    summary: "Claim status and reasons",
    ok: { status: 200, schema: S.ClaimDetailResponseSchema },
  },
  {
    method: "get",
    path: "/v1/worker/payouts",
    auth: "worker",
    priority: "P1",
    summary: "Payout history",
    ok: { status: 200, schema: S.PayoutsResponseSchema },
  },
  {
    method: "get",
    path: "/v1/public/verifications/{id}",
    auth: "none",
    priority: "P1",
    summary: "Public-safe result",
    ok: { status: 200, schema: S.PublicVerificationResultSchema },
  },
  {
    method: "post",
    path: "/v1/admin/flags",
    auth: "operator",
    priority: "P0",
    summary: "Set a platform kill switch",
    body: S.AdminFlagRequestSchema,
    ok: { status: 200, schema: null },
  },
  {
    method: "post",
    path: "/v1/admin/credentials/{id}/suspend",
    auth: "operator",
    priority: "P0",
    summary: "Suspend requester credential",
    ok: { status: 200, schema: null },
  },
  {
    method: "post",
    path: "/v1/admin/workers/{id}/suspend",
    auth: "operator",
    priority: "P0",
    summary: "Suspend worker",
    ok: { status: 200, schema: null },
  },
  {
    method: "post",
    path: "/v1/admin/credentials/{id}/revoke",
    auth: "operator",
    priority: "P0",
    summary: "Revoke API key",
    ok: { status: 200, schema: null },
  },
  {
    method: "post",
    path: "/v1/admin/verifications/{id}/evidence/revoke-access",
    auth: "operator",
    priority: "P0",
    summary: "Stop evidence access",
    ok: { status: 200, schema: null },
  },
  {
    method: "post",
    path: "/v1/admin/jobs/{id}/requeue",
    auth: "operator",
    priority: "P0",
    summary: "Requeue a DEAD outbox job",
    ok: { status: 200, schema: null },
  },
];

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" });
const securityFor: Record<Auth, unknown[]> = {
  requester: [{ requesterApiKey: [] }],
  worker: [{ privyAccessToken: [] }],
  operator: [{ adminToken: [] }],
  none: [],
};

const paths: Record<string, Record<string, unknown>> = {};
for (const e of ENDPOINTS) {
  const params: unknown[] = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  if (e.idempotent)
    params.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: json(S.IdempotencyKeyHeader),
    });
  if (e.query) {
    const q = json(e.query) as { properties?: Record<string, unknown>; required?: string[] };
    for (const [name, schema] of Object.entries(q.properties ?? {})) {
      params.push({ name, in: "query", required: q.required?.includes(name) ?? false, schema });
    }
  }
  const pathItem = paths[e.path] ?? {};
  paths[e.path] = pathItem;
  pathItem[e.method] = {
    summary: e.summary,
    "x-priority": e.priority,
    security: securityFor[e.auth],
    parameters: params,
    ...(e.body
      ? { requestBody: { required: true, content: { "application/json": { schema: json(e.body) } } } }
      : {}),
    responses: {
      [e.ok.status]: e.ok.schema
        ? { description: "OK", content: { "application/json": { schema: json(e.ok.schema) } } }
        : { description: "OK" },
      default: { description: "Error", content: { "application/json": { schema: json(S.ErrorBodySchema) } } },
    },
  };
}

const doc = {
  openapi: "3.0.3",
  info: {
    title: "ProofMarket API",
    version: "0.1.0",
    description:
      "Generated from packages/core/src/schemas/api.ts. Spec: specs/proofmarket/implementation/ja/05-api-design.md",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      requesterApiKey: { type: "http", scheme: "bearer", description: "pm_test_<prefix>_<secret>" },
      privyAccessToken: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      adminToken: { type: "http", scheme: "bearer" },
    },
  },
  paths,
  "x-webhook-payload": json(S.WebhookPayloadSchema),
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../openapi.json");
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote ${out} (${ENDPOINTS.length} operations)`);
