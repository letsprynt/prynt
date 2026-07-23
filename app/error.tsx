"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconAlert } from "@/components/icons";

// App-level error boundary: an uncaught render throw shows this (inside the shell) instead of Next's bare screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="board-state" style={{ marginTop: 60 }}>
      <div className="state-ico"><IconAlert size={30} /></div>
      <p>Something went wrong.</p>
      <p className="muted">An unexpected error occurred while loading this page.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={reset}>Try again</button>
        <Link href="/"><button className="secondary">Back to tokens</button></Link>
      </div>
    </div>
  );
}
