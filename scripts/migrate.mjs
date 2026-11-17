#!/usr/bin/env node
/**
 * Applies SQL migrations in ./drizzle to DATABASE_URL (idempotent — already-applied migrations are
 * skipped). Uses only runtime dependencies, so it works inside the production Docker image and in
 * Vercel's build step.
 *
 *   node scripts/migrate.mjs          apply migrations
 *   node scripts/migrate.mjs --rls    also apply db/rls.sql (Row Level Security, defence in depth)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set");
  process.exit(1);
}
const mode = process.env.DATABASE_SSL?.toLowerCase();
const ssl = mode === "no-verify" ? { rejectUnauthorized: false } : mode === "require" ? { rejectUnauthorized: true } : undefined;
const pool = new pg.Pool({ connectionString: url, ssl, max: 1, connectionTimeoutMillis: 15_000 });

try {
  const started = Date.now();
  await migrate(drizzle(pool), { migrationsFolder: join(root, "drizzle") });
  console.log(`✓ Database migrations up to date (${Date.now() - started} ms)`);
  if (process.argv.includes("--rls")) {
    await pool.query(readFileSync(join(root, "db", "rls.sql"), "utf8"));
    console.log("✓ Row Level Security policies applied");
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("✗ Migration failed:", msg);
  if (/already exists/i.test(msg)) {
    console.error("  This database was probably created with `drizzle-kit push` (dev). Either use a fresh database,\n  or keep using `npx drizzle-kit push` for it.");
  }
  if (/self-signed|certificate/i.test(msg)) console.error("  TLS issue: try DATABASE_SSL=no-verify and remove ?sslmode from DATABASE_URL.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
