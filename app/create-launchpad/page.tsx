import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreateLaunchpadWizard } from "@/components/launchpad/CreateLaunchpadWizard";
import { getServerConfig } from "@/lib/launchpad-server";
import { isSingleTenant } from "@/lib/launchpad-single";
import { APEX } from "@/lib/tenant-host";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (isSingleTenant()) return { title: "Not found", robots: { index: false, follow: false } };
  const cfg = await getServerConfig();
  const brand = `${cfg.name}${cfg.tld}`;
  return {
    title: "Create your launchpad",
    description: `Launch your own branded memecoin launchpad on ${brand}. Pick a name and a theme — it is live in seconds, on the same shared network of coins.`,
    alternates: { canonical: "/create-launchpad" },
  };
}

export default async function CreateLaunchpadPage() {
  // PLATFORM-ONLY. The designer writes a row into OUR database and signs the creator in with OUR
  // session secret. A single-launchpad deployment has neither, so left reachable it would offer a
  // stranger a polished create-a-launchpad flow under the operator's brand that reports every name
  // available (no database => nothing is taken) and then dies on a wallet signature.
  if (isSingleTenant()) notFound();

  const cfg = await getServerConfig();
  return (
    <div className="lp-page">
      <header className="lp-page-head">
        <h1>Create your launchpad</h1>
        <p>
          Your brand on the front door. Live in minutes, earning from every trade — on the same
          shared network of coins.
        </p>
      </header>
      {/* APEX is passed through EXACTLY as configured, empty included. The wizard's address panel
          treats an empty apex as "subdomain routing is off here" and says so; the old
          `|| "localhost:3000"` fallback made it print a hostname that resolved nowhere (and named
          the wrong port on this dev server). */}
      <CreateLaunchpadWizard apex={APEX} />
      <p className="note lp-page-foot">
        Creating a launchpad is free. Trading fees and the on-chain fee split are unchanged — see{" "}
        <a href="/how-it-works">how it works</a>.
      </p>
      <span hidden>{cfg.slug}</span>
    </div>
  );
}
