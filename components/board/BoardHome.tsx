import { TokenBoard } from "@/components/board/TokenBoard";
import { factoryConfigured } from "@/lib/contracts";
import { getServerConfig } from "@/lib/launchpad-server";

// The coin board itself, lifted out of app/page.tsx verbatim. It now has two callers — the tenant
// homepage ("/" on a launchpad host) and "/board" on the platform host — so the markup lives in one
// place instead of being duplicated and drifting.
export async function BoardHome() {
  const cfg = await getServerConfig();
  if (!factoryConfigured) {
    return (
      <div className="banner">
        No launchpad configured. Set <code>NEXT_PUBLIC_FACTORY_ADDRESS</code> in <code>.env.local</code>.
      </div>
    );
  }
  return (
    <>
      {/* seo.title is the full "<name><tld> — <what it is>" string; identical to the previous hard-coded h1 for prynt. */}
      <h1 className="sr-only">{cfg.seo.title}</h1>
      <TokenBoard />
    </>
  );
}
