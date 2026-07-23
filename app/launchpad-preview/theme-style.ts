import type { CSSProperties } from "react";
import type { LaunchpadTheme } from "@/lib/launchpad-config";
import { THEME_VAR_MAP } from "@/lib/launchpad-theme";

// The client-side twin of themeToCssVars() (lib/launchpad-theme.ts). That function builds a CSS
// STRING for an inline <style>, which is why it has to sanitize: the HTML tokenizer runs first and a
// "</style" or a "}" would escape the block. This one never builds a string — it hands React a style
// object, which React applies through CSSOM setProperty(). A declaration set that way cannot
// terminate itself, so the escape classes simply do not exist on this path.
//
// The variable map is imported rather than re-listed: a token added to the theme must not need a
// second edit here to show up in a preview.

/// Overrides land on a WRAPPER element, never on :root — so the page hosting the preview keeps the
/// platform's own theme and the exit control stays legible against Terminal or Neon.
export function themeToStyleObject(theme: LaunchpadTheme): CSSProperties {
  const style: Record<string, string> = {};
  for (const [field, cssVar] of THEME_VAR_MAP) {
    const value = theme[field];
    if (typeof value === "string") style[cssVar] = value;
  }
  return style as CSSProperties;
}

/// --logo-url and --koth-bg-url are not theme tokens; globals.css consumes them as `url(...)`
/// values (.logo-mark:358, .koth:1566). Quotes, parens and whitespace would break out of the
/// url() function, so they are stripped exactly as sanitizeUrl() does server-side. A malformed
/// value is dropped by CSSOM rather than injected, but the strip keeps the two paths identical.
export function themeUrlVars(logoUrl?: string, kothBgUrl?: string): CSSProperties {
  const style: Record<string, string> = {};
  const clean = (v: string) => v.replace(/[<>{};\\]/g, "").replace(/["'()\s]/g, "");
  if (logoUrl) style["--logo-url"] = `url("${clean(logoUrl)}")`;
  if (kothBgUrl) style["--koth-bg-url"] = `url("${clean(kothBgUrl)}")`;
  return style as CSSProperties;
}
