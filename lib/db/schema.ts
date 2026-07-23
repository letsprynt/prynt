import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { LaunchpadConfig } from "@/lib/launchpad-config";

// Tenant configuration lives in its OWN database, deliberately not the Ponder one: the indexer
// drops and re-syncs its schema whenever START_BLOCK or the contract set changes, and that must
// never be able to take every tenant's branding with it.

export const launchpads = pgTable(
  "launchpads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /// Subdomain label. Validated by checkSlug() before it ever gets here; unique so the
    /// database is the final arbiter of a race between two simultaneous creators.
    slug: text("slug").notNull().unique(),
    /// Lowercased 0x address of the wallet that signed the create request. Authorisation for every
    /// mutation is "does the session address equal this column".
    ownerAddress: text("owner_address").notNull(),
    /// The whole LaunchpadConfig. jsonb (not columns) because the shape is owned by the zod schema
    /// and evolves with the design system — a migration per new theme token would be absurd.
    /// Everything inside has been through launchpadConfigSchema.parse().
    config: jsonb("config").$type<LaunchpadConfig>().notNull(),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOwner: index("launchpads_owner_idx").on(t.ownerAddress),
    byStatus: index("launchpads_status_idx").on(t.status),
  }),
);

export const launchpadDomains = pgTable(
  "launchpad_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    launchpadId: uuid("launchpad_id")
      .notNull()
      .references(() => launchpads.id, { onDelete: "cascade" }),
    /// Globally unique: two tenants must never both claim the same hostname, or host-based
    /// resolution becomes non-deterministic.
    domain: text("domain").notNull().unique(),
    /// Only a verified domain is ever used to resolve a tenant. An unverified row is an intent,
    /// not a claim — otherwise anyone could add someone else's domain and hijack its branding.
    verified: boolean("verified").notNull().default(false),
    verificationToken: text("verification_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => ({
    byLaunchpad: index("launchpad_domains_launchpad_idx").on(t.launchpadId),
    byVerified: index("launchpad_domains_verified_idx").on(t.verified),
  }),
);

export type LaunchpadRow = typeof launchpads.$inferSelect;
export type LaunchpadDomainRow = typeof launchpadDomains.$inferSelect;
