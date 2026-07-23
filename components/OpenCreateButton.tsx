"use client";

import { useUi } from "@/lib/ui";

// Client island so a server-rendered page (e.g. /how-it-works) can still trigger the create modal.
export function OpenCreateButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const { openCreate } = useUi();
  return (
    <button className={className} onClick={openCreate}>
      {children}
    </button>
  );
}
