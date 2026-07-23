import type { Metadata } from "next";
import { ProfilePageClient } from "./ProfilePageClient";
import { getServerConfig } from "@/lib/launchpad-server";

// Server wrapper for SEO: creator profiles get their own title/canonical so the long tail of
// "coins by 0x…" pages indexes cleanly (they're all in the sitemap already).

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const addr = (address ?? "").toLowerCase();
  const short = addr.length === 42 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  const cfg = await getServerConfig();
  return {
    title: `Creator ${short}`,
    // One sentence, not brand + full site description: a profile meta that runs past ~160 chars gets
    // truncated mid-word in the result snippet. seo.title already reads "<brand> — <what it is>".
    description: `Coins launched by ${short} on ${cfg.seo.title}.`,
    alternates: { canonical: `${cfg.seo.siteUrl}/profile/${addr}` },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { address } = await params;
  return <ProfilePageClient address={address ?? ""} />;
}
