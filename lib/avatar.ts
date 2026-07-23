import type { CSSProperties } from "react";

// Deterministic gradient avatar derived from an address — every wallet/trader/holder gets a unique, stable identicon
// (no shared placeholder image, no dependency). Three hues sampled from the address bytes → a smooth Rainbow-style
// orb. Used everywhere an address is shown (wallet chip, holders, trades feed, profile, coin creator, cards) so the
// same address always renders the same avatar across the app. Pass no address for a neutral placeholder.
export function avatarStyle(addr?: string): CSSProperties {
  if (!addr) return { backgroundImage: "linear-gradient(135deg, #26272c, #17181c)" };
  const a = addr.toLowerCase().replace(/^0x/, "");
  const h = (i: number) => parseInt(a.slice(i, i + 6) || "0", 16) % 360;
  const [h1, h2, h3] = [h(0), h(10), h(30)];
  return {
    backgroundImage: `radial-gradient(circle at 30% 25%, hsl(${h1} 85% 62%), transparent 60%), radial-gradient(circle at 75% 80%, hsl(${h3} 80% 50%), transparent 62%), linear-gradient(135deg, hsl(${h1} 70% 52%), hsl(${h2} 68% 46%))`,
  };
}
