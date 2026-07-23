import { useEffect, useState } from "react";

/// Guards wallet-dependent UI against SSR hydration mismatches: render the dynamic bits only after mount.
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
