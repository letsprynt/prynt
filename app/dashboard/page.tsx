import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Dashboard } from "@/components/launchpad/Dashboard";
import { getServerConfig } from "@/lib/launchpad-server";
import { isSingleTenant } from "@/lib/launchpad-single";
import { APEX } from "@/lib/tenant-host";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (isSingleTenant()) return { title: "Not found", robots: { index: false, follow: false } };
  const cfg = await getServerConfig();
  return {
    title: "Dashboard",
    description: `Manage your launchpads on ${cfg.name}${cfg.tld}.`,
    // The owner panel must never be indexed: it is per-wallet and has nothing useful for a crawler.
    robots: { index: false, follow: false },
  };
}

export default function DashboardPage() {
  // PLATFORM-ONLY: this edits a row in OUR launchpads table, behind OUR wallet session. A
  // single-launchpad deployment has no row to edit — its config is the environment variable.
  if (isSingleTenant()) notFound();

  return (
    <div className="lp-page">
      <header className="lp-page-head">
        <h1>Dashboard</h1>
        <p>Edit your branding, connect a domain, see how the network is doing.</p>
      </header>
      {/* APEX exactly as configured, empty included — same rule as app/create-launchpad/page.tsx.
          The old `|| "localhost:3000"` fallback printed `<slug>.localhost:3000` addresses that
          resolve nowhere (and name the wrong port on this dev server). */}
      <Dashboard apex={APEX} />
    </div>
  );
}
