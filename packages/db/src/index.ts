import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export { schema };

/** Any drizzle Postgres handle or transaction over our schema (postgres-js in prod, PGlite in tests). */
// biome-ignore lint/suspicious/noExplicitAny: drizzle's driver-specific generics differ between drivers
export type Db = PgDatabase<PgQueryResultHKT, typeof schema, any>;

/** Server-only DB handle. Use the Supabase pooler URL in serverless (prepare: false). */
export function createDb(url: string): Db {
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema }) as unknown as Db;
}

/** Postgres error code helper (e.g. 23505 unique_violation). Works for postgres-js and PGlite errors. */
export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export function constraintName(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const c =
      (cur as { constraint?: unknown; constraint_name?: unknown }).constraint ??
      (cur as { constraint_name?: unknown }).constraint_name;
    if (typeof c === "string") return c;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}
