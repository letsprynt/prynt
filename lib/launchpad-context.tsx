"use client";

import { createContext, useContext } from "react";
import { DEFAULT_CONFIG, type LaunchpadConfig } from "./launchpad-config";

// Default value is the real prynt config, not null: a client component rendered outside the
// provider (a story, a test, a stray portal) should render the default brand rather than throw.
const LaunchpadContext = createContext<LaunchpadConfig>(DEFAULT_CONFIG);

export function LaunchpadProvider({
  config,
  children,
}: {
  config: LaunchpadConfig;
  children: React.ReactNode;
}) {
  // The config object is resolved once per request on the server and passed down whole, so there is
  // nothing to memoize here — a new object identity only appears when the tenant actually changes.
  return <LaunchpadContext.Provider value={config}>{children}</LaunchpadContext.Provider>;
}

export function useLaunchpad(): LaunchpadConfig {
  return useContext(LaunchpadContext);
}
