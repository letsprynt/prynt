// Privacy-light product analytics. No-ops unless NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set (then the Plausible script
// loaded in the layout provides window.plausible). Centralizes funnel event names so they stay consistent.
type Props = Record<string, string | number | boolean | undefined>;

export type AnalyticsEvent =
  | "wallet_connect_start"
  | "wallet_connect_success"
  | "create_open"
  | "create_submit"
  | "create_success"
  | "buy_click"
  | "buy_success"
  | "sell_click"
  | "sell_success"
  | "share_click"
  | "token_view";

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Props }) => void;
  }
}

export function track(event: AnalyticsEvent, props?: Props) {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    /* analytics must never break the app */
  }
}
