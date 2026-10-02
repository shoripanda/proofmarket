// Shared helpers for operator scripts. Run scripts with:
//   pnpm --filter @proofmarket/scripts run run <script>.ts --flag value
// (adds --conditions=react-server so `server-only` modules from apps/web can be imported).
import { createDb } from "@proofmarket/db";

export function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k?.startsWith("--")) {
      const v = a[i + 1];
      if (v === undefined || v.startsWith("--")) out[k.slice(2)] = "true";
      else {
        out[k.slice(2)] = v;
        i++;
      }
    }
  }
  return out;
}

export function need(a: Record<string, string>, k: string): string {
  const v = a[k];
  if (!v) {
    console.error(`missing --${k}`);
    process.exit(2);
  }
  return v;
}

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }
  return createDb(url);
}
