import type { LaunchpadConfig, LaunchpadTheme } from "./launchpad-config";

// The single source of truth for "theme field -> CSS custom property". Anything that needs the
// mapping iterates this; there must never be a second hand-written list to drift out of sync.
export const THEME_VAR_MAP: ReadonlyArray<readonly [keyof LaunchpadTheme, string]> = [
  ["bg", "--bg"],
  ["surface", "--surface"],
  ["surface2", "--surface-2"],
  ["border", "--border"],
  ["borderSoft", "--border-soft"],
  ["accent", "--accent"],
  ["accentHover", "--accent-hover"],
  ["accentDeep", "--accent-deep"],
  ["accentSoft", "--accent-soft"],
  ["accentLine", "--accent-line"],
  ["ink", "--ink"],
  ["hot", "--hot"],
  ["up", "--up"],
  ["down", "--down"],
  ["text", "--text"],
  ["textMuted", "--text-muted"],
  ["textSubtle", "--text-subtle"],
  ["grad", "--grad"],
  ["glow", "--glow"],
  ["fontSans", "--font-sans"],
  ["radiusXs", "--r-xs"],
  ["radiusSm", "--r-sm"],
  ["radiusMd", "--r-md"],
  ["radiusLg", "--r-lg"],
  ["radiusCard", "--r-card"],
  ["radiusPill", "--r-pill"],
  ["ring", "--ring"],
  ["ringHover", "--ring-hover"],
  ["shadowSm", "--shadow-sm"],
  ["shadowMd", "--shadow-md"],
  ["shadowLg", "--shadow-lg"],
  // Chrome + interactive greys: brand surfaces that were literals inside individual rules until
  // multi-tenant theming landed. Without these a dark tenant renders a white sidebar.
  ["chrome", "--chrome"],
  ["chromeBar", "--chrome-bar"],
  ["hover", "--hover"],
  ["track", "--track"],
  ["control", "--control"],
  ["dividerStrong", "--divider-strong"],
  ["overlay", "--overlay"],
];
// Deliberately absent: the alias vars (--panel, --panel-2, --muted, --green, --red). They are
// defined in globals.css as var() references to the tokens above, so they follow an override for
// free. Emitting them here as literals would freeze them at prynt's values and break every tenant.

/// Values land inside an inline <style> element, where the browser's CSS tokenizer is *preceded* by
/// the HTML tokenizer: the first "</style" ends the block regardless of CSS syntax. Angle brackets
/// have no legitimate use in any of these tokens, so dropping them is lossless and closes the hole.
///
/// Braces and semicolons are dropped for the same reason one level down: with `}` left in, a value
/// like `#fff}html{display:none` closes the `:root` block and appends arbitrary rules to the
/// document. `/*` is dropped because an unterminated comment swallows every declaration after it.
/// None of these characters appear in a colour, length, shadow, gradient or font stack, so removing
/// them cannot damage a legitimate token — and `loadTenants()` is explicitly destined to become a
/// remote fetch, which makes this function the trust boundary, not a formality.
function sanitize(value: string): string {
  return value
    .replace(/[<>{};]/g, "")
    .replace(/\\/g, "")
    .replace(/\/\*|\*\//g, "")
    .trim();
}

/// URLs additionally sit inside url("..."), so a stray quote or paren would escape the function.
function sanitizeUrl(value: string): string {
  return sanitize(value).replace(/["'()\s]/g, "");
}

/// Render the tenant's `:root` override block. Emitted after globals.css so it wins on equal
/// specificity; layout/geometry tokens are intentionally not touched.
export function themeToCssVars(config: LaunchpadConfig): string {
  const decls = THEME_VAR_MAP.map(([field, cssVar]) => `${cssVar}:${sanitize(config.theme[field])}`);
  decls.push(`--logo-url:url("${sanitizeUrl(config.logoUrl)}")`);
  decls.push(`--koth-bg-url:url("${sanitizeUrl(config.kothBgUrl)}")`);
  return `:root{${decls.join(";")}}`;
}
