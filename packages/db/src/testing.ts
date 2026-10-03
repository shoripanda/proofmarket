// In-process Postgres (PGlite) with the real migration SQL: tests (memory) and local dev (file-backed).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "./index.ts";
import * as schema from "./schema.ts";

// Resolved lazily: bundlers (Next.js) leave import.meta.dirname undefined, and only migrations need the path.
const migrationsDir = () => join(import.meta.dirname, "../drizzle");

async function applyMigrations(pg: PGlite, from = 0): Promise<number> {
  const MIGRATIONS = migrationsDir();
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files.slice(from)) {
    for (const stmt of readFileSync(join(MIGRATIONS, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  return files.length;
}

export async function createTestDb(): Promise<{ db: Db; pg: PGlite }> {
  const pg = new PGlite();
  await applyMigrations(pg);
  return { db: drizzle(pg, { schema }) as unknown as Db, pg };
}

/** File-backed PGlite for local development (DATABASE_URL=pglite:<dir>). Run migratePglite first. */
export function openPgliteDb(dataDir: string): Db {
  return drizzle(new PGlite(dataDir), { schema }) as unknown as Db;
}

/** Apply migrations not yet applied to a file-backed PGlite (tracked in a tiny table). */
export async function migratePglite(dataDir: string): Promise<void> {
  const pg = new PGlite(dataDir);
  await pg.exec("create table if not exists _dev_migrations (n int not null)");
  const r = await pg.query<{ n: number }>("select coalesce(max(n), 0)::int n from _dev_migrations");
  const done = r.rows[0]?.n ?? 0;
  const total = await applyMigrations(pg, done);
  await pg.query("insert into _dev_migrations (n) values ($1)", [total]);
  await pg.close();
}
