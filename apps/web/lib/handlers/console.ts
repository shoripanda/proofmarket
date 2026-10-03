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
