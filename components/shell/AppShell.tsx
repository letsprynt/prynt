"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useUi } from "@/lib/ui";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { CreateModal } from "./CreateModal";
import { MarketingShell } from "./MarketingShell";
import { Toaster } from "@/components/Toaster";

// Routes that get the marketing chrome instead of the app chrome — but only on the platform host.
// Kept as a set rather than a prefix test so /board, /token/*, /dashboard and /create-launchpad can
// never fall into it by accident.
const MARKETING_ROUTES = new Set(["/"]);

// Referral capture and the sound unlock used to live here. They moved to ClientBootstrap (mounted in
// the root layout) because they must keep working on routes that do not render this shell — the
// landing below is exactly such a route, and it is where referral links point.
export function AppShell({
  children,
  isPlatform = false,
}: {
  children: ReactNode;
  // Stamped per request by resolveServerContext() and handed down from the root layout. It is a
  // prop rather than something read from the launchpad config because the platform/tenant
  // distinction is a property of the REQUEST, never of the (owner-editable) config row.
  // Defaults to false so that a caller which forgets to pass it renders the app chrome: showing
  // the board furniture on the apex for a moment is harmless, showing marketing chrome on a
  // tenant's own domain is not.
  isPlatform?: boolean;
}) {
  const { collapsed } = useUi();
  const pathname = usePathname();

  if (isPlatform && MARKETING_ROUTES.has(pathname)) {
    return <MarketingShell>{children}</MarketingShell>;
  }

  return (
    <div className={`shell${collapsed ? " collapsed" : ""}`}>
      <Sidebar isPlatform={isPlatform} />
      <div className="shell-main">
        <TopBar />
        <main className="shell-content">{children}</main>
      </div>
      <BottomNav />
      <CreateModal />
      <Toaster />
    </div>
  );
}
