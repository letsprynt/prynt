import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { DEFAULT_CONFIG, type LaunchpadConfig } from "@/lib/launchpad-config";
import { launchpadConfigSchema } from "@/lib/launchpad-schema";

// Data access for tenant configs. This is the module the phase-1 resolver was written to be
// swapped onto: `loadTenants()` in launchpad-config.ts was the placeholder, this is the real thing.
//
// EVERY read path is failure-tolerant. Resolution runs on every single page request, so a database
// hiccup must degrade to the default tenant rather than 500 the whole site.

const CACHE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 15_000; // remember misses too, or an unknown host hammers the DB every hit

type Entry = { config: LaunchpadConfig | null; expires: number };

declare global {
  // eslint-disable-next-line no-var
  var __launchpadCache: Map<string, Entry> | undefined;
}
const cache = (globalThis.__launchpadCache ??= new Map<string, Entry>());

function cacheGet(key: string): Entry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

function cacheSet(key: string, config: LaunchpadConfig | null) {
  cache.set(key, { config, expires: Date.now() + (config ? CACHE_TTL_MS : NEGATIVE_TTL_MS) });
  // Unbounded growth would be a memory leak on a long-lived server being probed with random hosts.
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expires - b[1].expires).slice(0, 100);
    for (const [k] of oldest) cache.delete(k);
  }
}

export function invalidate(slug: string) {
  for (const key of [...cache.keys()]) {
    if (key === `slug:${slug}` || key.startsWith("host:")) cache.delete(key);
  }
}

/// A stored row's config is re-parsed on read. The row was validated on write, but a config that
/// predates a schema change (or was edited straight in SQL) must not be able to inject anything
/// into the page — so the trust boundary is re-crossed here, not just at the API.
function parseRow(raw: unknown, slug: string): LaunchpadConfig | null {
  const parsed = launchpadConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[launchpad-store] stored config for "${slug}" failed validation; ignoring row:`, parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data as LaunchpadConfig;
}

export async function getBySlug(slug: string): Promise<LaunchpadConfig | null> {
  const key = `slug:${slug}`;
  const hit = cacheGet(key);
  if (hit) return hit.config;

  const db = getDb();
  if (!db) {
    // No database: the bundled default is the only tenant that exists.
    const fallback = slug === DEFAULT_CONFIG.slug ? DEFAULT_CONFIG : null;
    cacheSet(key, fallback);
    return fallback;
  }

  try {
    const [row] = await db
      .select()
      .from(schema.launchpads)
      .where(and(eq(schema.launchpads.slug, slug), eq(schema.launchpads.status, "active")))
      .limit(1);
    const config = row ? parseRow(row.config, slug) : null;
    cacheSet(key, config);
    return config;
  } catch (err) {
    console.error(`[launchpad-store] getBySlug("${slug}") failed:`, err);
    // Do NOT cache an infrastructure error as a negative result — it would pin the site to the
    // fallback for the whole TTL after a blip.
    return slug === DEFAULT_CONFIG.slug ? DEFAULT_CONFIG : null;
  }
}

/// Resolve by custom domain. Only verified rows count: an unverified domain is an unproven claim,
/// and honouring it would let anyone point a hostname at us and wear another tenant's branding.
export async function getByDomain(domain: string): Promise<LaunchpadConfig | null> {
  const key = `host:${domain}`;
  const hit = cacheGet(key);
  if (hit) return hit.config;

  const db = getDb();
  if (!db) {
    cacheSet(key, null);
    return null;
  }

  try {
    const [row] = await db
      .select({ config: schema.launchpads.config, slug: schema.launchpads.slug })
      .from(schema.launchpadDomains)
      .innerJoin(schema.launchpads, eq(schema.launchpadDomains.launchpadId, schema.launchpads.id))
      .where(
        and(
          eq(schema.launchpadDomains.domain, domain),
          eq(schema.launchpadDomains.verified, true),
          eq(schema.launchpads.status, "active"),
        ),
      )
      .limit(1);
    const config = row ? parseRow(row.config, row.slug) : null;
    cacheSet(key, config);
    return config;
  } catch (err) {
    console.error(`[launchpad-store] getByDomain("${domain}") failed:`, err);
    return null;
  }
}

export async function slugTaken(slug: string): Promise<boolean> {
  if (slug === DEFAULT_CONFIG.slug) return true;
  const db = getDb();
  if (!db) return false;
  try {
    const [row] = await db
      .select({ id: schema.launchpads.id })
      .from(schema.launchpads)
      .where(eq(schema.launchpads.slug, slug))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    console.error(`[launchpad-store] slugTaken("${slug}") failed:`, err);
    // Fail CLOSED on a check that guards uniqueness: better to tell the user "try again" than to
    // let two launchpads race for one slug. The unique index is still the real backstop.
    throw err;
  }
}

export async function create(params: {
  slug: string;
  ownerAddress: string;
  config: LaunchpadConfig;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Config database is not available" };
  try {
    const [row] = await db
      .insert(schema.launchpads)
      .values({
        slug: params.slug,
        ownerAddress: params.ownerAddress.toLowerCase(),
        config: params.config,
      })
      .returning({ id: schema.launchpads.id });
    invalidate(params.slug);
    return { ok: true, id: row.id };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      return { ok: false, error: "That name is already taken" };
    }
    console.error("[launchpad-store] create failed:", err);
    return { ok: false, error: "Could not save the launchpad" };
  }
}

export async function getRow(slug: string) {
  const db = getDb();
  if (!db) return null;
  try {
    const [row] = await db.select().from(schema.launchpads).where(eq(schema.launchpads.slug, slug)).limit(1);
    return row ?? null;
  } catch (err) {
    console.error(`[launchpad-store] getRow("${slug}") failed:`, err);
    return null;
  }
}

export async function update(slug: string, config: LaunchpadConfig): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await db
      .update(schema.launchpads)
      .set({ config, updatedAt: new Date() })
      .where(eq(schema.launchpads.slug, slug));
    invalidate(slug);
    return true;
  } catch (err) {
    console.error(`[launchpad-store] update("${slug}") failed:`, err);
    return false;
  }
}

export async function listByOwner(ownerAddress: string) {
  const db = getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(schema.launchpads)
      .where(eq(schema.launchpads.ownerAddress, ownerAddress.toLowerCase()))
      .orderBy(sql`${schema.launchpads.createdAt} desc`);
  } catch (err) {
    console.error("[launchpad-store] listByOwner failed:", err);
    return [];
  }
}

/// How many launchpads are live, for the marketing proof bar. Returns null — never 0 — when the
/// number cannot be known (no database configured, query failed), because the proof bar's rule is
/// "a real number or no stat at all"; a placeholder zero would be a worse lie than showing nothing.
/// COUNT(*) only, so no tenant config ever leaves the database through this path.
export async function countActive(): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.launchpads)
      .where(eq(schema.launchpads.status, "active"));
    const n = Number(row?.n ?? 0);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.error("[launchpad-store] countActive failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
//                                          DOMAINS
// ---------------------------------------------------------------------------------------------

export async function listDomains(launchpadId: string) {
  const db = getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(schema.launchpadDomains)
      .where(eq(schema.launchpadDomains.launchpadId, launchpadId));
  } catch (err) {
    console.error("[launchpad-store] listDomains failed:", err);
    return [];
  }
}

export async function addDomain(launchpadId: string, domain: string, token: string) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "Config database is not available" };
  try {
    const [row] = await db
      .insert(schema.launchpadDomains)
      .values({ launchpadId, domain, verificationToken: token })
      .returning();
    return { ok: true as const, row };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      return { ok: false as const, error: "That domain is already registered" };
    }
    console.error("[launchpad-store] addDomain failed:", err);
    return { ok: false as const, error: "Could not add the domain" };
  }
}

export async function getDomain(id: string) {
  const db = getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .select()
      .from(schema.launchpadDomains)
      .where(eq(schema.launchpadDomains.id, id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function markVerified(id: string, domain: string) {
  const db = getDb();
  if (!db) return false;
  try {
    await db
      .update(schema.launchpadDomains)
      .set({ verified: true, verifiedAt: new Date() })
      .where(eq(schema.launchpadDomains.id, id));
    cache.delete(`host:${domain}`);
    return true;
  } catch (err) {
    console.error("[launchpad-store] markVerified failed:", err);
    return false;
  }
}
