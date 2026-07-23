"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useDisconnect, useSwitchChain } from "wagmi";
import { activeChain } from "@/lib/wagmi";
import { faucetUrl, isTestnet } from "@/lib/explorer";
import { shortAddr } from "@/lib/format";
import { avatarStyle } from "@/lib/avatar";
import { useMounted } from "@/lib/useMounted";
import { WalletModal } from "@/components/WalletModal";
import { IconCopy, IconDrop, IconExternal, IconPower, IconUser, IconWallet } from "@/components/icons";

export function ConnectButton() {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: bal } = useBalance({ address, query: { enabled: isConnected } });
  const [open, setOpen] = useState(false); // connected wallet menu
  const [pick, setPick] = useState(false); // connect modal (disconnected)
  const walletRef = useRef<HTMLDivElement>(null);

  // Close the connected menu on click-outside / Escape (the connect modal handles its own).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // If the user switches to a DIFFERENT account in their wallet (e.g. a Phantom account switch), DON'T silently
  // follow it — disconnect instead, so connecting an account is always an explicit, deliberate action.
  const prevAddr = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevAddr.current;
    if (prev && address && prev.toLowerCase() !== address.toLowerCase()) {
      disconnect();
    }
    prevAddr.current = address;
  }, [address, disconnect]);

  if (!mounted) return <button className="connect-cta" disabled><IconWallet size={16} /> Connect</button>;

  if (!isConnected) {
    return (
      <>
        <button className="connect-cta" onClick={() => setPick(true)}>
          <IconWallet size={16} /> Connect wallet
        </button>
        <WalletModal open={pick} onClose={() => setPick(false)} />
      </>
    );
  }

  if (chainId !== activeChain.id) {
    return (
      <button className="net-warn" onClick={() => switchChain({ chainId: activeChain.id })} disabled={switching}>
        <span className="net-warn-dot" />
        {switching ? "Switching…" : `Switch to ${activeChain.name}`}
      </button>
    );
  }

  const balStr = bal ? Number(bal.formatted).toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—";
  const needsFunds = isTestnet() && bal != null && bal.value === 0n;
  const faucet = faucetUrl();
  const explorer = activeChain.blockExplorers?.default.url;

  return (
    <div className="wallet" ref={walletRef}>
      <button className="wallet-chip" onClick={() => setOpen((v) => !v)}>
        <span className="wallet-avatar" style={avatarStyle(address!)} />
        <span className="wallet-bal">{balStr} ETH</span>
        <span className="wallet-addr">{shortAddr(address)}</span>
      </button>
      {open && (
        <div className="wallet-menu">
          <div className="wm-id">
            <span className="wallet-avatar wm-id-av" style={avatarStyle(address!)} />
            <div className="wm-id-meta">
              <span className="wm-id-addr">{shortAddr(address)}</span>
              <span className="wm-id-chain"><span className="wm-chain-dot" />{activeChain.name}</span>
            </div>
          </div>
          {needsFunds && faucet && (
            <a href={faucet} target="_blank" rel="noopener noreferrer" className="wm-item wm-faucet" onClick={() => setOpen(false)}>
              <IconDrop size={14} /> Get test ETH
            </a>
          )}
          {isTestnet() && <span className="wm-note">Testnet — not real funds</span>}
          <Link href={`/profile/${address}`} className="wm-item" onClick={() => setOpen(false)}>
            <IconUser size={14} /> My profile
          </Link>
          <button className="wm-item" onClick={() => { navigator.clipboard.writeText(address!); setOpen(false); }}>
            <IconCopy size={14} /> Copy address
          </button>
          {explorer && (
            <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer" className="wm-item" onClick={() => setOpen(false)}>
              <IconExternal size={14} /> View on explorer
            </a>
          )}
          <button className="wm-item danger" onClick={() => { disconnect(); setOpen(false); }}>
            <IconPower size={14} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
