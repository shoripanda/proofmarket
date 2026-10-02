// In-process fetch that routes SDK requests to the real handlers (no HTTP server needed).

import type { AppContext } from "../../lib/context";
import { handleCancel, handleCreate, handleGet, handlePublicResult } from "../../lib/handlers/requester";
import { route } from "../../lib/http";

type H = (app: AppContext, req: Request, id: string) => Promise<Response>;
const TABLE: [string, RegExp, H][] = [
  ["POST", /^\/v1\/verifications$/, (a, r) => handleCreate(a, r)],
  ["GET", /^\/v1\/verifications\/([^/]+)$/, handleGet],
  ["POST", /^\/v1\/verifications\/([^/]+)\/cancel$/, handleCancel],
  ["GET", /^\/v1\/public\/verifications\/([^/]+)$/, handlePublicResult],
];

export function inProcessFetch(app: AppContext): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    for (const [m, re, h] of TABLE) {
      const match = re.exec(path);
      if (req.method === m && match)
        return route((r: Request) => h(app, r, decodeURIComponent(match[1] ?? "")))(req, undefined);
    }
    return Response.json(
      { error: { code: "VERIFICATION_NOT_FOUND", message: "no route", retryable: false, details: {} } },
      { status: 404 },
    );
  }) as typeof fetch;
}
