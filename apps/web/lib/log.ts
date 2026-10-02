import "server-only";

/** One JSON line per event (08 §5). Redacts keys that must never be logged. */
const REDACT =
  /^(authorization|token|secret|nonce|lat|lng|latitude|longitude|coords|api_key|password|.*_secret.*|.*_key)$/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, x]) => [
      k,
      REDACT.test(k) ? "[redacted]" : redact(x, depth + 1),
    ]),
  );
}

export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...(redact(fields) as object) });
  (level === "error" ? console.error : console.log)(line);
}
