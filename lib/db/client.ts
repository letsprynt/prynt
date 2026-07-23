import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// The config database is OPTIONAL by design. Acceptance criterion 7: with a missing or broken
// connection string the site must still boot and serve the default tenant. So this module never
// throws at import time and never at call time — callers get `null` and fall back.
//
// Connection is created lazily and memoised on globalThis so Next's dev-mode module reloading does
// not open a new pool on every edit (the classic "too many clients already" in local development).

const DB_URL = process.env.LAUNCHPADS_DATABASE_URL;

type Db = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __launchpadDb: { db: Db; sql: postgres.Sql } | null | undefined;
}

export function getDb(): Db | null {
  if (!DB_URL) return null;
  if (globalThis.__launchpadDb !== undefined) return globalThis.__launchpadDb?.db ?? null;

  try {
    const sql = postgres(DB_URL, {
      // A serverless function should hold one connection, not a pool — Postgres runs out of
      // backends long before the platform runs out of lambdas.
      max: Number(process.env.LAUNCHPADS_DB_MAX_CONNECTIONS ?? 1),
      idle_timeout: 20,
      connect_timeout: 10,
      // Managed Postgres (Railway/Neon/Supabase) terminates plaintext; `prepare: false` keeps this
      // compatible with transaction-mode poolers such as PgBouncer.
      prepare: false,
      onnotice: () => {},
    });
    const db = drizzle(sql, { schema });
    globalThis.__launchpadDb = { db, sql };
    return db;
  } catch (err) {
    console.error("[launchpad-db] connection setup failed, falling back to the bundled default tenant:", err);
    globalThis.__launchpadDb = null;
    return null;
  }
}

/// True when a config database is configured at all. Used by API routes to answer 503 instead of
/// pretending a write succeeded.
export const dbConfigured = Boolean(DB_URL);

export { schema };
