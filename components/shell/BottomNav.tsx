"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useUi } from "@/lib/ui";
import { IconFlame, IconHome, IconPlus, IconUser } from "@/components/icons";

// Mobile-only bottom tab bar (shown ≤720px; the sidebar is hidden there). Gives the full width back to the grid.
export function BottomNav() {
  const pathname = usePathname();
  const { setSort, openCreate } = useUi();
  const { address } = useAccount();
  const onHome = pathname === "/";

  return (
    <nav className="bottom-nav">
      <Link href="/" className={`bn-item${onHome ? " active" : ""}`} onClick={() => setSort("new")}>
        <IconHome size={20} /><span>Home</span>
      </Link>
      <Link href="/" className="bn-item" onClick={() => setSort("volume")}>
        <IconFlame size={20} /><span>Trending</span>
      </Link>
      <button className="bn-item bn-create" onClick={openCreate} aria-label="Create token">
        <span className="bn-plus"><IconPlus size={22} /></span>
      </button>
      {address && (
        <Link href={`/profile/${address}`} className={`bn-item${pathname.startsWith("/profile") ? " active" : ""}`}>
          <IconUser size={20} /><span>Profile</span>
        </Link>
      )}
    </nav>
  );
}
