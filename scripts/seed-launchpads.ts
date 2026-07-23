/**
 * Seed the config database with the bundled tenants.
 *
 *   LAUNCHPADS_DATABASE_URL=postgres://... npx tsx scripts/seed-launchpads.ts
 *
 * Idempotent: existing slugs are updated, not duplicated. The bundled DEFAULT_CONFIG stays in the
 * code as the emergency fallback (acceptance criterion 7 — the site must boot with no database),
 * so seeding is about making prynt editable through the dashboard like any other tenant, not about
 * making it *work*.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { DEFAULT_CONFIG, DEMO_TENANT_A, DEMO_TENANT_B } from "../lib/launchpad-config";
import { launchpadConfigSchema } from "../lib/launchpad-schema";
import * as schema from "../lib/db/schema";

const URL_ = process.env.LAUNCHPADS_DATABASE_URL;
if (!URL_) {
  console.error("LAUNCHPADS_DATABASE_URL is not set");
  process.exit(1);
}

// The wallet that owns the seeded tenants. Without it the rows exist but nobody can edit them
// through the dashboard, so this is required for anything but a throwaway local database.
const OWNER = (process.env.SEED_OWNER_ADDRESS ?? "0x0000000000000000000000000000000000000000").toLowerCase();

async function main() {
  const sql = postgres(URL_!, { max: 1, prepare: false });
  const db = drizzle(sql, { schema });

  for (const cfg of [DEFAULT_CONFIG, DEMO_TENANT_A, DEMO_TENANT_B]) {
    // Validate before writing: a bundled config that cannot pass the schema would be accepted here
    // and then rejected on read, leaving a tenant that exists but never renders.
    const parsed = launchpadConfigSchema.safeParse(cfg);
    if (!parsed.success) {
      console.error(`  ✗ ${cfg.slug}: bundled config fails validation`);
      for (const i of parsed.error.issues.slice(0, 5)) console.error(`      ${i.path.join(".")}: ${i.message}`);
      process.exitCode = 1;
      continue;
    }

    const [existing] = await db
      .select({ id: schema.launchpads.id })
      .from(schema.launchpads)
      .where(eq(schema.launchpads.slug, cfg.slug))
      .limit(1);

    if (existing) {
      await db
        .update(schema.launchpads)
        .set({ config: parsed.data as never, updatedAt: new Date() })
        .where(eq(schema.launchpads.id, existing.id));
      console.log(`  ↻ ${cfg.slug} updated`);
    } else {
      await db
        .insert(schema.launchpads)
        .values({ slug: cfg.slug, ownerAddress: OWNER, config: parsed.data as never });
      console.log(`  + ${cfg.slug} created (owner ${OWNER})`);
    }
  }

  await sql.end();
  console.log("seed done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
