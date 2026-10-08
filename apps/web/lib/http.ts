import "server-only";
import { ApiError, type ErrorCode } from "@proofmarket/core";
import { log } from "./log";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: ApiError -> spec error body; anything else -> INTERNAL_ERROR without details (REQ-N-001). */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const requestId = crypto.randomUUID();
    try {
      const res = await handler(req, ctx);
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL_ERROR");
      if (!(e instanceof ApiError)) {
        log("error", "unhandled", {
          request_id: requestId,
          path: new URL(req.url).pathname,
          error: String(e),
          // drizzle wraps the driver's error ("Failed query: ..."); the reason is in the cause chain
          cause: causeChain(e),
        });
      }
      return Response.json(err.toBody(), { status: err.http, headers: { "X-Request-Id": requestId } });
    }
  };
}

export function fail(code: ErrorCode, details: Record<string, unknown> = {}): never {
  throw new ApiError(code, details);
}

/** Placeholder for endpoints whose implementation lands in a later PR (10 §3). */
export function notImplemented(pr: string) {
  return route(async () => fail("NOT_IMPLEMENTED", { pr }));
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", { body: "invalid JSON" });
  }
}

export type IdParams = { params: Promise<{ id: string }> };

/** The messages of e.cause, e.cause.cause, ... (at most 4), so a wrapped error still says why. */
function causeChain(e: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = (e as { cause?: unknown })?.cause;
  for (let i = 0; i < 4 && cur; i++) {
    out.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    cur = (cur as { cause?: unknown })?.cause;
  }
  return out;
}
