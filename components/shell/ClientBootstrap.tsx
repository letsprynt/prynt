"use client";

import { useEffect } from "react";
import { captureRef } from "@/lib/referral";
import { unlockSound } from "@/lib/sound";

// Route-independent client side effects. These used to live in AppShell, which is fine only while
// AppShell wraps every route. The platform apex is about to render a different chrome on "/", and
// "/" is exactly where referral links land — first-touch attribution must not depend on which shell
// happens to be mounted. Rendered from the root layout so it runs on every route, forever.
export function ClientBootstrap() {
  useEffect(() => captureRef(), []); // first-touch referral capture

  // Browsers only allow audio after a real user gesture; arm it on the first pointer event.
  useEffect(() => {
    window.addEventListener("pointerdown", unlockSound, { once: true });
    return () => window.removeEventListener("pointerdown", unlockSound);
  }, []);

  return null;
}
