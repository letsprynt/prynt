import type { LaunchpadTheme } from "@/lib/launchpad-config";

// Ready-made themes for the creator. A tenant picks one and overrides a single accent colour —
// that is the whole customisation surface in this phase.
//
// WHY PRESETS AND NOT A FULL EDITOR: every value here ends up inside an inline <style> on a page we
// serve. Presets are authored by us and reviewed once; a free-form colour editor multiplies the
// number of ways a tenant can produce an unreadable (or invisible) UI, and free-form CSS would be a
// straight XSS hole. Accent-only overrides keep contrast predictable.

export type ThemePreset = {
  id: string;
  label: string;
  blurb: string;
  /// Shown in the picker without rendering the whole preview.
  swatch: { bg: string; surface: string; accent: string; text: string };
  theme: LaunchpadTheme;
};

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/// Mix `hex` with black by `amount` (0 = unchanged, 1 = black).
function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => c * (1 - amount));
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/// Derived accent shades. A tenant supplies ONE colour; hover/deep/soft/line are computed so the
/// set stays coherent instead of asking a user to pick five greens that go together.
///
/// The shades are computed in JS to concrete hex/rgba, NOT emitted as `color-mix()`. Two reasons,
/// both load-bearing:
///   1. the config validator only accepts literal colours — a CSS function would have to be
///      allow-listed, widening the surface that reaches an inline <style>;
///   2. the OG cards are rendered by Satori, which does not implement `color-mix`, so an accent
///      expressed that way would silently render as black on every shared link.
export function accentFamily(accent: string) {
  const deep = darken(accent, 0.38);
  return {
    accent,
    accentHover: darken(accent, 0.18),
    accentDeep: deep,
    accentSoft: rgba(accent, 0.08),
    accentLine: rgba(accent, 0.22),
    grad: `linear-gradient(135deg, ${accent}, ${deep})`,
  };
}

const FONT =
  "'Satoshi', -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Inter, system-ui, sans-serif";

/// Fields identical across presets: geometry-adjacent tokens that the preset's own radii override.
const SHARED = {
  fontSans: FONT,
  radiusPill: "999px",
} as const;

function build(t: Omit<LaunchpadTheme, "fontSans" | "radiusPill">): LaunchpadTheme {
  return { ...t, ...SHARED };
}

// CONTRAST IS PART OF THE PRESET, not something the creator is expected to fix. Four of the six
// shipped presets used to fail the wizard's own thresholds on the fast path (pick preset → pick
// accent → export), where the warning panel is inside a collapsed <details> nobody opens:
//
//   clean-light  textSubtle on bg  2.80  → #929298 (3.09)
//   ocean        textSubtle on bg  2.44  → #8690A1 (3.05)
//   dark-degen   ink on accent     4.35  → ink #0B0B0B (4.53)
//   neon         ink on accent     3.45  → ink #0B0B0B (5.71)
//   warm-paper   ink on accent     3.63  → ink #0B0B0B (5.42)
//
// `ink` is the label ON the primary button, so a failure there is unreadable buttons. The three new
// values are exactly what the wizard's own autoInk() computes for those accents — the same answer
// its "Auto" button gives. A creator who then picks their own accent can still break the pair, which
// is what the (now always-visible) contrast warnings are for.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "clean-light",
    label: "Clean light",
    blurb: "Calm white canvas, soft shadows. The prynt.fun look.",
    swatch: { bg: "#FFFFFF", surface: "#F6F7F8", accent: "#1B7A4E", text: "#1D1D1F" },
    theme: build({
      bg: "#FFFFFF", surface: "#FFFFFF", surface2: "#F6F7F8",
      border: "#ECECEE", borderSoft: "rgba(0, 0, 0, 0.05)",
      ...accentFamily("#1B7A4E"),
      ink: "#FFFFFF", hot: "#A35D00", up: "#1B7A4E", down: "#C0392B",
      text: "#1D1D1F", textMuted: "#6E6E73", textSubtle: "#929298",
      glow: "0 8px 24px rgba(0, 0, 0, .10)",
      radiusXs: "8px", radiusSm: "12px", radiusMd: "12px", radiusLg: "18px", radiusCard: "14px",
      ring: "0 0 0 1px #E8E8EB", ringHover: "0 0 0 1px #DCDCE1",
      shadowSm: "0 1px 2px rgba(0, 0, 0, .05)", shadowMd: "0 6px 20px rgba(0, 0, 0, .08)",
      shadowLg: "0 24px 60px rgba(0, 0, 0, .14)",
      chrome: "#FAFAFA", chromeBar: "rgba(255, 255, 255, 0.82)", hover: "#EDEEF0",
      track: "#E9EAEC", control: "#D3D3D8", dividerStrong: "#D8D8DC",
      overlay: "rgba(29, 29, 31, 0.28)",
    }),
  },
  {
    id: "dark-degen",
    label: "Dark degen",
    blurb: "Near-black, high contrast, built for night trading.",
    swatch: { bg: "#0B0B10", surface: "#14141C", accent: "#7C5CFF", text: "#F2F2F7" },
    theme: build({
      bg: "#0B0B10", surface: "#14141C", surface2: "#1A1A24",
      border: "#2A2A36", borderSoft: "rgba(255, 255, 255, 0.06)",
      ...accentFamily("#7C5CFF"),
      ink: "#0B0B0B", hot: "#FFB45C", up: "#3DD68C", down: "#FF5C6C",
      text: "#F2F2F7", textMuted: "#A0A0B0", textSubtle: "#6E6E80",
      glow: "0 8px 24px rgba(0, 0, 0, .55)",
      radiusXs: "8px", radiusSm: "12px", radiusMd: "14px", radiusLg: "20px", radiusCard: "18px",
      ring: "0 0 0 1px #262631", ringHover: "0 0 0 1px #34343F",
      shadowSm: "0 1px 2px rgba(0, 0, 0, .40)", shadowMd: "0 6px 20px rgba(0, 0, 0, .55)",
      shadowLg: "0 24px 60px rgba(0, 0, 0, .65)",
      chrome: "#101018", chromeBar: "rgba(11, 11, 16, 0.82)", hover: "#1C1C26",
      track: "#23232E", control: "#31313E", dividerStrong: "#2A2A36",
      overlay: "rgba(0, 0, 0, 0.55)",
    }),
  },
  {
    id: "terminal",
    label: "Terminal",
    blurb: "Phosphor green on black, sharp corners, zero decoration.",
    swatch: { bg: "#07090A", surface: "#0D1113", accent: "#25D366", text: "#D7E2DC" },
    theme: build({
      bg: "#07090A", surface: "#0D1113", surface2: "#12181A",
      border: "#1E2729", borderSoft: "rgba(140, 255, 190, 0.07)",
      ...accentFamily("#25D366"),
      ink: "#04140A", hot: "#E5B567", up: "#25D366", down: "#F2545B",
      text: "#D7E2DC", textMuted: "#8FA39A", textSubtle: "#5E6F68",
      glow: "0 0 0 rgba(0, 0, 0, 0)",
      radiusXs: "2px", radiusSm: "2px", radiusMd: "2px", radiusLg: "4px", radiusCard: "2px",
      ring: "0 0 0 1px #1E2729", ringHover: "0 0 0 1px #2B3A3D",
      shadowSm: "0 1px 0 rgba(0, 0, 0, .6)", shadowMd: "0 2px 0 rgba(0, 0, 0, .7)",
      shadowLg: "0 8px 0 rgba(0, 0, 0, .8)",
      chrome: "#0A0E10", chromeBar: "rgba(7, 9, 10, 0.88)", hover: "#161E20",
      track: "#1A2325", control: "#243033", dividerStrong: "#1E2729",
      overlay: "rgba(0, 0, 0, 0.7)",
    }),
  },
  {
    id: "neon",
    label: "Neon",
    blurb: "Deep violet with an electric accent and generous glow.",
    swatch: { bg: "#0C0718", surface: "#150C28", accent: "#FF2E97", text: "#F4EDFF" },
    theme: build({
      bg: "#0C0718", surface: "#150C28", surface2: "#1D1136",
      border: "#2E1D50", borderSoft: "rgba(255, 255, 255, 0.07)",
      ...accentFamily("#FF2E97"),
      ink: "#0B0B0B", hot: "#FFC93C", up: "#3DF5B0", down: "#FF4D6D",
      text: "#F4EDFF", textMuted: "#B4A3D8", textSubtle: "#7C6BA8",
      glow: "0 8px 32px rgba(255, 46, 151, .35)",
      radiusXs: "10px", radiusSm: "14px", radiusMd: "16px", radiusLg: "24px", radiusCard: "20px",
      ring: "0 0 0 1px #2E1D50", ringHover: "0 0 0 1px #4A2E7F",
      shadowSm: "0 1px 3px rgba(0, 0, 0, .5)", shadowMd: "0 8px 28px rgba(120, 0, 90, .45)",
      shadowLg: "0 24px 60px rgba(80, 0, 60, .6)",
      chrome: "#110A20", chromeBar: "rgba(12, 7, 24, 0.82)", hover: "#241540",
      track: "#2A1A4A", control: "#3A2564", dividerStrong: "#2E1D50",
      overlay: "rgba(6, 3, 12, 0.6)",
    }),
  },
  {
    id: "warm-paper",
    label: "Warm paper",
    blurb: "Off-white paper stock, ink-brown text, understated.",
    swatch: { bg: "#FFFDFB", surface: "#FFFFFF", accent: "#D2691E", text: "#1A1613" },
    theme: build({
      bg: "#FFFDFB", surface: "#FFFFFF", surface2: "#FAF3EC",
      border: "#EFE4D9", borderSoft: "rgba(80, 50, 20, 0.06)",
      ...accentFamily("#D2691E"),
      ink: "#0B0B0B", hot: "#B25C00", up: "#137A52", down: "#C0392B",
      text: "#1A1613", textMuted: "#6B5C50", textSubtle: "#9C8C7E",
      glow: "0 8px 24px rgba(60, 30, 0, .10)",
      radiusXs: "3px", radiusSm: "4px", radiusMd: "4px", radiusLg: "6px", radiusCard: "4px",
      ring: "0 0 0 1px #EFE4D9", ringHover: "0 0 0 1px #E0CDB9",
      shadowSm: "0 1px 2px rgba(60, 30, 0, .06)", shadowMd: "0 6px 20px rgba(60, 30, 0, .10)",
      shadowLg: "0 24px 60px rgba(60, 30, 0, .16)",
      chrome: "#FFF7F0", chromeBar: "rgba(255, 253, 251, 0.85)", hover: "#F6EADF",
      track: "#EFE1D4", control: "#DCC8B5", dividerStrong: "#E6D6C6",
      overlay: "rgba(26, 22, 19, 0.30)",
    }),
  },
  {
    id: "ocean",
    label: "Ocean",
    blurb: "Cool slate blues, calm and corporate-safe.",
    swatch: { bg: "#F7F9FC", surface: "#FFFFFF", accent: "#1D6FD6", text: "#101828" },
    theme: build({
      bg: "#F7F9FC", surface: "#FFFFFF", surface2: "#EEF2F8",
      border: "#E2E8F0", borderSoft: "rgba(16, 24, 40, 0.05)",
      ...accentFamily("#1D6FD6"),
      ink: "#FFFFFF", hot: "#B54708", up: "#067647", down: "#B42318",
      text: "#101828", textMuted: "#475467", textSubtle: "#8690A1",
      glow: "0 8px 24px rgba(16, 24, 40, .10)",
      radiusXs: "6px", radiusSm: "8px", radiusMd: "10px", radiusLg: "16px", radiusCard: "12px",
      ring: "0 0 0 1px #E2E8F0", ringHover: "0 0 0 1px #CBD5E1",
      shadowSm: "0 1px 2px rgba(16, 24, 40, .06)", shadowMd: "0 6px 20px rgba(16, 24, 40, .10)",
      shadowLg: "0 24px 60px rgba(16, 24, 40, .16)",
      chrome: "#FFFFFF", chromeBar: "rgba(247, 249, 252, 0.85)", hover: "#E7EDF6",
      track: "#E2E8F0", control: "#CBD5E1", dividerStrong: "#D6DEE9",
      overlay: "rgba(16, 24, 40, 0.35)",
    }),
  },
];

export const DEFAULT_PRESET_ID = "clean-light";

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/// Apply a tenant's accent choice on top of a preset. Only the accent family moves; every other
/// token (and therefore every contrast relationship the preset was designed with) is preserved.
export function themeFromPreset(presetId: string, accent?: string): LaunchpadTheme {
  const preset = getPreset(presetId);
  if (!accent) return preset.theme;
  return { ...preset.theme, ...accentFamily(accent) };
}
