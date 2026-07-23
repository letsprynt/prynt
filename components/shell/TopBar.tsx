"use client";

import { useUi } from "@/lib/ui";
import { ConnectButton } from "@/components/ConnectButton";
import { SoundToggle } from "./SoundToggle";
import { IconPlus } from "@/components/icons";
import { LiveTicker } from "@/components/board/LiveTicker";

export function TopBar() {
  const { openCreate } = useUi();

  return (
    <header className="topbar">
      <LiveTicker />
      <div className="topbar-right">
        <button className="create-btn" onClick={openCreate}><IconPlus size={16} /><span>Create</span></button>
        <SoundToggle />
        <ConnectButton />
      </div>
    </header>
  );
}
