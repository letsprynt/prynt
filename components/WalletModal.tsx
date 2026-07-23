"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Connector } from "wagmi";
import { useConnect } from "wagmi";
import { activeChain } from "@/lib/wagmi";
import { track } from "@/lib/analytics";
import { IconClose, IconWallet } from "@/components/icons";
import { useLaunchpad } from "@/lib/launchpad-context";

// Robinhood Wallet mark — feather on the brand green tile. Drawn inline (no external asset; nominative use,
// same as listing "MetaMask"). Robinhood Wallet is a mobile app that connects to dapps via WalletConnect.
function RobinhoodIcon() {
  return (
    <svg className="wmod-ico" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#00C805" />
      <path
        d="M25.8 9.5c-2.4 0-5 1-7.2 2.9-2.9 2.4-4.9 6-5.8 9.9l-1.6 7c-.1.5.4.9.9.7l2.6-1.2c.4-.2.6-.5.7-.9l.9-4.1c.7-3.3 2.4-6.3 4.8-8.3 1.2-1 2.5-1.7 3.7-2l-2.1 5.3c-.2.5.3 1 .8.8l2.7-1c.4-.1.6-.4.8-.8l2.3-6.2c.2-.5.1-1-.3-1.4-.7-.5-1.9-.7-3.2-.7z"
        fill="#fff"
      />
    </svg>
  );
}

// WalletConnect double-arc mark on its brand blue.
function WalletConnectIcon() {
  return (
    <svg className="wmod-ico" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#3B99FC" />
      <path
        d="M12.6 16.9c4.1-4 10.7-4 14.8 0l.5.5c.2.2.2.5 0 .7l-1.7 1.6c-.1.1-.3.1-.4 0l-.7-.7c-2.9-2.8-7.5-2.8-10.4 0l-.7.7c-.1.1-.3.1-.4 0l-1.7-1.6c-.2-.2-.2-.5 0-.7l.7-.5zm18.3 3.4 1.5 1.4c.2.2.2.5 0 .7l-6.7 6.5c-.2.2-.5.2-.7 0L20.2 24c-.1-.1-.2-.1-.2 0l-4.8 4.9c-.2.2-.5.2-.7 0l-6.7-6.5c-.2-.2-.2-.5 0-.7l1.5-1.4c.2-.2.5-.2.7 0l4.8 4.7c.1.1.2.1.2 0l4.8-4.7c.2-.2.5-.2.7 0l4.8 4.7c.1.1.2.1.2 0l4.8-4.7c.4-.2.7-.2.9 0z"
        fill="#fff"
      />
    </svg>
  );
}

// Rabby mark — rabbit head on the brand blue tile. Rabby ships Robinhood Chain BUILT-IN (integrated 2026-07-03:
// https://x.com/Rabby_io/status/2072894705420145086), so it's the wallet we recommend installing.
function RabbyIcon() {
  return (
    <svg className="wmod-ico" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#7084FF" />
      <ellipse cx="15.2" cy="12.5" rx="3.1" ry="6" transform="rotate(-14 15.2 12.5)" fill="#fff" />
      <ellipse cx="24.8" cy="12.5" rx="3.1" ry="6" transform="rotate(14 24.8 12.5)" fill="#fff" />
      <ellipse cx="20" cy="23.5" rx="8.6" ry="7.6" fill="#fff" />
      <circle cx="16.6" cy="22.6" r="1.25" fill="#7084FF" />
      <circle cx="23.4" cy="22.6" r="1.25" fill="#7084FF" />
      <path d="M18.6 26.2c.9.8 1.9.8 2.8 0" stroke="#7084FF" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// wagmi surfaces a bare injected() connector as "Injected" when it can't name the provider — friendlier label.
const walletName = (c: Connector) => (c.name === "Injected" ? "Browser wallet" : c.name);

// Non-EVM extensions (TRON/Solana-only) announce themselves via EIP-6963 too — useless on Robinhood Chain
// (an EVM L2), so keep them out of the list entirely.
const NON_EVM = /tronlink|solflare|unisat/i;

/// Centered connect-wallet dialog (launchpad-style): brand header, detected browser wallets with their real
/// icons (EIP-6963), then mobile options — Robinhood Wallet and any WalletConnect wallet (both ride the
/// WalletConnect connector; Robinhood Wallet is WC-compatible). Focus-trapped, ESC/overlay closes.
export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cfg = useLaunchpad();
  const { connect, connectors, isPending } = useConnect();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); // surfaced connect failure — never swallow it
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus trap + ESC + scroll lock — same idiom as CreateModal.
  useEffect(() => {
    if (!open) return;
    setErr(null); // fresh attempt each time the dialog opens
    const card = cardRef.current;
    const focusables = () =>
      card
        ? Array.from(
            card.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'),
          ).filter((el) => el.offsetParent !== null)
        : [];
    const t = setTimeout(() => focusables()[0]?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Browser (injected/EIP-6963) wallets, de-duped by name; WalletConnect handled separately below.
  // The bare injected() connector exists even with NO provider behind it (clicking it would just throw
  // "Provider not found") — only list it when window.ethereum is actually there.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasInjected = typeof window !== "undefined" && !!(window as any).ethereum;
  const seen = new Set<string>();
  const browser = connectors.filter((c) => {
    if (c.type === "walletConnect") return false;
    if (c.id === "injected" && !hasInjected) return false;
    if (NON_EVM.test(c.name)) return false;
    const k = c.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const wc = connectors.find((c) => c.type === "walletConnect");
  const rabbyDetected = browser.some((c) => /rabby/i.test(c.name));

  const pick = (c: Connector, label: string) => {
    track("wallet_connect_start", { connector: label });
    setPendingId(label);
    setErr(null);
    connect(
      { connector: c },
      {
        onSettled: () => setPendingId(null),
        onSuccess: () => onClose(),
        onError: (e) => {
          // Session-settle failures (e.g. the wallet app doesn't support this chain) died silently before.
          const msg = e.message.split("\n")[0].slice(0, 160);
          setErr(/user rejected|user denied/i.test(msg) ? null : msg); // a deliberate cancel isn't an error
        },
      },
    );
  };

  const row = (
    key: string,
    icon: React.ReactNode,
    name: string,
    sub: string,
    onClick: (() => void) | null,
    tag?: string,
  ) => (
    <button
      key={key}
      className="wmod-row"
      disabled={isPending || !onClick}
      onClick={onClick ?? undefined}
      title={onClick ? undefined : "WalletConnect is not configured yet"}
    >
      {icon}
      <span className="wmod-meta">
        <span className="wmod-name">{name}</span>
        <span className="wmod-sub">{sub}</span>
      </span>
      {pendingId === key ? (
        <span className="wm-spin" aria-label="connecting" />
      ) : (
        tag && <span className="wm-tag">{tag}</span>
      )}
    </button>
  );

  // Portal to <body>: the button lives inside the topbar, whose backdrop-filter creates a containing block
  // for position:fixed — rendered in place, the overlay would be trapped inside the bar instead of full-screen.
  return createPortal(
    <div className="modal-overlay leave-overlay" onClick={onClose}>
      <div
        className="modal-card wmod-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close secondary" onClick={onClose} aria-label="Close">
          <IconClose size={16} />
        </button>
        <div className="panel wmod">
          <div className="wmod-head">
            <span className="logo-mark wmod-mark" aria-hidden />
            <h3 className="wmod-title">Connect to {cfg.name}</h3>
            <p className="wmod-tag-line">
              <span className="wm-chain-dot" /> {activeChain.name} · any EVM wallet works
            </p>
          </div>

          <div className="wmod-sect">Browser</div>
          <div className="wmod-list">
            {browser.map((c) =>
              row(
                walletName(c),
                c.icon ? (
                  <img className="wmod-ico" src={c.icon} alt="" />
                ) : (
                  <span className="wmod-ico wmod-ico-fallback"><IconWallet size={18} /></span>
                ),
                walletName(c),
                "Browser extension",
                () => pick(c, walletName(c)),
                "Detected",
              ),
            )}
            {!rabbyDetected && (
              <a className="wmod-row" href="https://rabby.io" target="_blank" rel="noopener noreferrer">
                <RabbyIcon />
                <span className="wmod-meta">
                  <span className="wmod-name">Rabby Wallet</span>
                  <span className="wmod-sub">Robinhood Chain built-in — no setup</span>
                </span>
                <span className="wm-tag">Install</span>
              </a>
            )}
          </div>

          <div className="wmod-sect">Mobile</div>
          <div className="wmod-list">
            {row(
              "Robinhood Wallet",
              <RobinhoodIcon />,
              "Robinhood Wallet",
              "Scan the QR with the app",
              wc ? () => pick(wc, "Robinhood Wallet") : null,
              wc ? "QR" : "Setup",
            )}
            {row(
              "WalletConnect",
              <WalletConnectIcon />,
              "WalletConnect",
              "MetaMask, Phantom & 400+ wallets",
              wc ? () => pick(wc, "WalletConnect") : null,
              wc ? "QR" : "Setup",
            )}
          </div>
          {!wc && (
            <div className="wm-empty">
              Mobile connect needs a WalletConnect project ID (<code>NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code>).
            </div>
          )}
          {err && (
            <div className="wmod-err" role="alert">
              <strong>Connection failed:</strong> {err}
              <span className="wmod-err-hint">
                Usually this means the wallet app doesn&rsquo;t support {activeChain.name}. Try a browser wallet, or
                MetaMask mobile with the network added manually.
              </span>
            </div>
          )}
          <div className="wmod-foot">
            <a href="https://ethereum.org/en/wallets/" target="_blank" rel="noopener noreferrer">New to wallets?</a>
            <span className="wmod-foot-note">Self-custody — {cfg.name} never holds your funds</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
