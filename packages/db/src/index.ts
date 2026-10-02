import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export { schema };

/** Server-only DB handle. Use the Supabase pooler URL in serverless (prepare: false). */
export function createDb(url: string) {
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}
export type Db = ReturnType<typeof createDb>;
