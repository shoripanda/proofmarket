import "server-only";
import { ApiError } from "@proofmarket/core";
// Requester console endpoints (01 §4.14). Cookie-authenticated POSTs require a same-site Origin.
import type { AppContext } from "../context";
import { readJson } from "../http";
import {
  assertSameOrigin,
  CONSOLE_COOKIE,
  clearedCookie,
  consoleAuth,
  createConsoleSession,
  endConsoleSession,
  sessionCookie,
} from "../services/console-service";
import { ensureDepositReference } from "../services/deposit-service";
import { decideApplication, decideSeat, requesterSend } from "../services/market-task-service";
import { clientIp } from "../services/oauth-service";
import { stopSchedule } from "../services/schedule-service";

export function cookieToken(req: Request): string | undefined {
  const m = new RegExp(`(?:^|;\\s*)${CONSOLE_COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "");
  return m?.[1];
}

export async function handleConsoleLogin(app: AppContext, req: Request) {
  assertSameOrigin(req);
  const { token, expiresAt } = await createConsoleSession(app, await readJson(req), clientIp(req));
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token, expiresAt, req) } });
}

export async function handleConsoleLogout(app: AppContext, req: Request) {
  assertSameOrigin(req);
  await endConsoleSession(app, cookieToken(req));
  return Response.json({ ok: true }, { headers: { "set-cookie": clearedCookie() } });
}

export async function handleConsoleStopSchedule(app: AppContext, req: Request, id: string) {
  assertSameOrigin(req);
  const auth = await consoleAuth(app, cookieToken(req));
  if (!auth) throw new ApiError("UNAUTHENTICATED");
  return Response.json(await stopSchedule(app, auth, id));
}

/** POST /v1/console/deposit — issue the requester's deposit reference (15 §4.3); repeat calls return the same one. */
export async function handleConsoleDeposit(app: AppContext, req: Request) {
  assertSameOrigin(req);
  const auth = await consoleAuth(app, cookieToken(req));
  if (!auth) throw new ApiError("UNAUTHENTICATED");
  return Response.json({ reference: await ensureDepositReference(app, auth) });
}

// ---------- general tasks from the console (docs/architecture 13 §8) ----------

const reasonOf = (raw: unknown): string | null =>
  raw && typeof raw === "object" && "reason" in raw && typeof raw.reason === "string" && raw.reason.trim()
    ? raw.reason.trim().slice(0, 1000)
    : null;

/** POST /v1/console/tasks/{id}/applications/{app_id}/{accept|reject} */
export async function handleConsoleTaskApplication(
  app: AppContext,
  req: Request,
  id: string,
  appId: string,
  action: string,
) {
  assertSameOrigin(req);
  const auth = await consoleAuth(app, cookieToken(req));
  if (!auth) throw new ApiError("UNAUTHENTICATED");
  if (action !== "accept" && action !== "reject") throw new ApiError("VALIDATION_FAILED", { action });
  const raw = await readJson(req).catch(() => ({}));
  return Response.json(await decideApplication(app, auth, id, appId, action, reasonOf(raw)));
}

/** POST /v1/console/tasks/{id}/seats/{seat_id}/{release|request-changes|reject}. A reason is required to send back. */
export async function handleConsoleTaskSeat(
  app: AppContext,
  req: Request,
  id: string,
  seatId: string,
  action: string,
) {
  assertSameOrigin(req);
  const auth = await consoleAuth(app, cookieToken(req));
  if (!auth) throw new ApiError("UNAUTHENTICATED");
  const raw = await readJson(req).catch(() => ({}));
  if (action === "release") return Response.json(await decideSeat(app, auth, id, seatId, "release", null));
  if (action !== "request-changes" && action !== "reject")
    throw new ApiError("VALIDATION_FAILED", { action });
  const reason = reasonOf(raw);
  if (!reason) throw new ApiError("VALIDATION_FAILED", { field: "reason", reason: "required" });
  return Response.json(
    await decideSeat(app, auth, id, seatId, action === "reject" ? "reject" : "request_changes", reason),
  );
}

/** POST /v1/console/tasks/{id}/seats/{seat_id}/messages */
export async function handleConsoleSeatMessage(app: AppContext, req: Request, id: string, seatId: string) {
  assertSameOrigin(req);
  const auth = await consoleAuth(app, cookieToken(req));
  if (!auth) throw new ApiError("UNAUTHENTICATED");
  const raw = await readJson(req).catch(() => ({}));
  const body =
    raw && typeof raw === "object" && "body" in raw && typeof raw.body === "string" ? raw.body : "";
  return Response.json(await requesterSend(app, auth, id, seatId, body));
}
