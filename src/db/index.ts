import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

/**
 * Postgres connection.
 *  - DATABASE_URL       required at runtime (not during `next build`, so Docker/CI builds work without a DB)
 *  - DATABASE_SSL       "require" (verify certificate) | "no-verify" (encrypted, skip CA check — e.g. Supabase
 *                       pooler without its CA bundle) | unset (use whatever the URL's sslmode says)
 *  - DATABASE_POOL_MAX  max connections per instance (default 10; use 1–3 on serverless)
 */
const databaseUrl = process.env.DATABASE_URL;
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

if (!databaseUrl && !isBuild) {
  throw new Error("DATABASE_URL is required");
}

function sslConfig(): PoolConfig["ssl"] {
  const mode = process.env.DATABASE_SSL?.toLowerCase();
  if (mode === "no-verify") return { rejectUnauthorized: false };
  if (mode === "require") return { rejectUnauthorized: true };
  return undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: sslConfig(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
