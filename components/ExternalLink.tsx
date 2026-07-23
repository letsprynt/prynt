"use client";

import { useState, type ReactNode } from "react";
import { safeUrl } from "@/lib/metadata";
import { IconAlert } from "@/components/icons";
import { useLaunchpad } from "@/lib/launchpad-context";

/// A link to an untrusted, creator-supplied destination. Clicking it does NOT navigate immediately — it pops a
/// "you're leaving <brand>" interstitial that shows exactly where the link goes, so users can see the real URL
/// before deciding. Renders nothing if the href isn't a safe http(s) URL.
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const cfg = useLaunchpad();
  const brand = `${cfg.name}${cfg.tld}`;
  const [open, setOpen] = useState(false);
  const url = safeUrl(href);
  if (!url) return null;

  let host = url;
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    /* safeUrl already parsed it; keep the full string as fallback */
  }

  function leave() {
    window.open(url!, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <>
      <a
        href={url}
        className={className}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>

      {open && (
        <div className="modal-overlay leave-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="leave-modal" onClick={(e) => e.stopPropagation()}>
            <span className="leave-ico"><IconAlert size={20} /></span>
            <h3>You&rsquo;re leaving {brand}</h3>
            <p className="muted">
              This link was added by the coin&rsquo;s creator and is <strong>not verified</strong> by {brand}. Check it&rsquo;s
              what you expect before continuing.
            </p>
            <div className="leave-url">
              <span className="leave-url-host">{host}</span>
              <span className="leave-url-full">{url}</span>
            </div>
            <div className="leave-actions">
              <button className="secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button onClick={leave}>Continue&nbsp;→</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
