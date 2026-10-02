import "server-only";
import { ApiError, type ErrorCode } from "@proofmarket/core";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: ApiError -> spec error body; anything else -> INTERNAL_ERROR without details (REQ-N-001). */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("INTERNAL_ERROR");
      // PR-02: structured log with request_id / verification_id; never log tokens, nonces, coordinates.
      return Response.json(err.toBody(), { status: err.http });
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
