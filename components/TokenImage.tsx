"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { imgSrc } from "@/lib/img";
import { useUi } from "@/lib/ui";

// Deterministic gradient per seed — the fallback when a token has no image OR its IPFS image fails to load.
function seedGradient(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 46%), hsl(${(h + 40) % 360} 70% 38%))`;
}

/// One image with a graceful fallback: shows the gradient monogram when `src` is missing OR errors at load.
/// Recovers automatically: (1) when `src` changes (e.g. the indexer just backfilled a freshly-pinned image) the
/// failed state resets so the new URL renders; (2) a fresh IPFS pin can 404 for a few seconds, so a load error
/// retries the same URL a few times (cache-busted) before giving up to the monogram.
export function TokenImage({
  src,
  alt = "",
  seed,
  label,
  className,
  nsfw,
}: {
  src?: string | null;
  alt?: string;
  seed: string;
  label: string;
  className?: string;
  nsfw?: boolean;
}) {
  const { showSensitive } = useUi();
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const tries = useRef(0);
  // route every IPFS image through our caching proxy → served from our domain, fast + cached for all users
  const proxied = useMemo(() => imgSrc(src), [src]);

  useEffect(() => {
    // new (or newly non-null) src → start fresh so a later-resolved image actually shows
    setFailed(false);
    setNonce(0);
    tries.current = 0;
  }, [src]);

  // NSFW gate: cover flagged images with a click-to-reveal placeholder and don't even load the pixels, unless the
  // user globally opted in (showSensitive) or revealed this one. No effect on un-flagged images (nsfw falsy).
  if (nsfw && !showSensitive && !revealed) {
    return (
      <span
        className={className}
        role="button"
        tabIndex={0}
        title="Sensitive content — click to reveal"
        aria-label="Sensitive content — click to reveal"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealed(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setRevealed(true); } }}
        style={{ background: "#F6F7F8", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>🔞</span>
      </span>
    );
  }

  if (!proxied || failed) {
    return (
      <span className={className} style={{ background: seedGradient(seed), display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", textTransform: "uppercase", overflow: "hidden" }}>
        {label.slice(0, 2)}
      </span>
    );
  }

  const url = nonce > 0 ? `${proxied}${proxied.includes("?") ? "&" : "?"}r=${nonce}` : proxied;
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        if (tries.current < 3) {
          tries.current += 1;
          const n = tries.current;
          setTimeout(() => setNonce(n), 1500 * n); // fresh pin not propagated yet — retry the same URL shortly
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
