import type { Config } from "drizzle-kit";

// Migrations for the TENANT CONFIG database only. The Ponder indexer owns its own schema in a
// separate database and manages its own lifecycle — never point this at it.
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.LAUNCHPADS_DATABASE_URL ?? "postgres://localhost:5432/launchpads_dev",
  },
} satisfies Config;
