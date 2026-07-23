"use client";

// First-touch referral attribution. `?ref=0x..` on any URL is captured once into localStorage. On-chain
// fee routing to the referrer is NOT live yet (needs a contract redeploy with a referrer fee slice) — for now
// this records attribution so it can be honored later + measured via analytics.
const KEY = "vf:ref";

export function captureRef() {
  if (typeof window === "undefined") return;
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && /^0x[0-9a-fA-F]{40}$/.test(ref) && !localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, ref.toLowerCase());
    }
  } catch {}
}

export function getRef(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
