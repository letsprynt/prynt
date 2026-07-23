"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import {
  DEFAULT_CONFIG,
  type LaunchpadFeatures,
  type LaunchpadLinks,
  type LaunchpadTheme,
} from "@/lib/launchpad-config";
import { checkSlugShape, colour, launchpadConfigSchema, safeUrl, slugify, themeSchema } from "@/lib/launchpad-schema";
import { DEFAULT_PRESET_ID, THEME_PRESETS, getPreset, themeFromPreset } from "@/lib/theme-presets";
import { ThemePreview } from "./ThemePreview";
import { useToast } from "@/lib/toast";

// Three steps, and the last one changed shape.
//   1. identity  — name, suffix, handle, logo, tagline
//   2. look      — preset + accent on the fast path; everything else behind one collapsed
//                  "Advanced" disclosure, so the thirty-second flow never grows a wall of pickers
//   3. take it   — the creator walks away with a config they own. The wallet-signature + POST path
//                  that writes a row into OUR database is still here, unchanged, as a secondary
//                  option — prynt.fun runs on it and demo tenants are created with it.
//
// WHY THE LAST STEP INVERTED. The product is not a hosted multi-tenant SaaS: an operator deploys
// this app to their OWN hosting and serves it on their OWN domain. So the artefact the creator
// leaves with is a config value, not a row. Signing a message to claim a subdomain is the platform's
// flow, and it stays available on the platform.
//
// CUSTOMISATION MODEL. The theme carries 38 tokens and this screen exposes ELEVEN of them, because
// the rest are derivable and no human should be asked to pick five greens that go together:
//
//   primitive (has a control)    derived from it, never a control
//   ---------------------------  ------------------------------------------------------------
//   accent                       accentHover accentDeep accentSoft accentLine grad (accentFamily)
//   bg, text                     surface2 border borderSoft chrome chromeBar hover track control
//                                dividerStrong overlay ring ringHover shadowSm/Md/Lg glow
//   textMuted                    textSubtle
//   surface, ink, up, down, hot  —
//   typeface (closed list)       fontSans
//   corners (closed list)        radiusXs/Sm/Md/Lg/Card/Pill
//
// Every value a control here can produce is checked with the SAME zod schemas the API validates
// with (`colour`, `safeUrl`, `themeSchema`, `launchpadConfigSchema`), so a creator can never reach a
// 400 — and, on the export path, can never carry away a config the deployment would refuse to boot.

type Step = 1 | 2 | 3;

// ------------------------------------------------------------------------------------------------
//                              THE SELF-HOST HANDOFF — SHARED CONTRACT
// ------------------------------------------------------------------------------------------------
//
// RECONCILED against the reader, lib/launchpad-single.ts, which lands the other half of this
// contract. Its `decode()` accepts exactly what `encodeLaunchpadConfig` below emits: one unbroken
// [A-Za-z0-9_-]+ token, re-padded on its side, so the stripped "=" is expected rather than
// tolerated. Verified end-to-end by round-tripping a generated value through that decoder.
//
//     LAUNCHPAD_CONFIG = base64url( JSON.stringify(config) )
//
// These three constants are the whole of what this file knows about the format. Nothing else here
// touches the encoding.

/// The environment variable an operator pastes into their own hosting dashboard. Server-only.
export const SINGLE_TENANT_ENV_VAR = "LAUNCHPAD_CONFIG";

/// The OPTIONAL public mirror. It is read by lib/wagmi.ts — a CLIENT module, where `LAUNCHPAD_CONFIG`
/// does not exist (Next only substitutes NEXT_PUBLIC_* into the browser bundle) — and it decides the
/// name, description, icon and accent of the WalletConnect modal. Emitted commented-out in the
/// downloaded .env: it is a real improvement, not a requirement, and a second copy of the same value
/// is a second thing to forget to update.
export const PUBLIC_MIRROR_ENV_VAR = "NEXT_PUBLIC_LAUNCHPAD_CONFIG";

// ---------------------------------------------------------------------------------------------
//                                     ONE-CLICK DEPLOY
// ---------------------------------------------------------------------------------------------
//
// Vercel's clone flow is a plain URL — no OAuth, no API token, no GitHub App to register. It sends
// the operator to Vercel, Vercel asks THEM to connect THEIR GitHub, forks the template into THEIR
// account, prompts for the variables named in `env=`, and deploys to THEIR project. We hold no
// credential and touch nothing they own.
//
// TWO THINGS THIS CANNOT DO, both by Vercel's design, and the UI must not pretend otherwise:
//   1. It cannot pre-fill env VALUES. `env=` names the variables and `envDescription` explains them;
//      the values are typed by the operator on Vercel's own screen. That is why the button copies
//      the config to the clipboard on the way out — the paste target is one labelled box in the
//      deploy form, not a settings page they have to go and find afterwards.
//   2. It cannot clone a PRIVATE repository. The URL below has to resolve for anonymous visitors.
//
/// The public, frontend-only template an operator's deployment is cloned from — NOT the monorepo, so
/// the contracts, indexer and deploy scripts never travel with it. It is CONFIGURATION, not a code
/// constant: set NEXT_PUBLIC_TEMPLATE_REPO on the platform to your published repo and the one-click
/// button turns on by itself. No env var set -> no repo exists yet -> the button stays off and the
/// screen shows the honest manual path instead of a button that 404s (indistinguishable from "broken"
/// to someone who does not code). This is the ONLY thing to set when you publish the template.
const TEMPLATE_REPO = process.env.NEXT_PUBLIC_TEMPLATE_REPO?.trim() || "";

/// On exactly when a real public repo is configured. Derived, not a second flag to keep in sync.
const DEPLOY_READY = TEMPLATE_REPO.length > 0;

/// The variables Vercel prompts for during the clone. Order is the order they appear on screen, so
/// the one that carries the whole design goes first and the third-party key second.
const DEPLOY_ENV = [SINGLE_TENANT_ENV_VAR, "PINATA_JWT"] as const;

function deployUrl(slug: string): string {
  const q = new URLSearchParams({
    "repository-url": TEMPLATE_REPO,
    "project-name": slug || "my-launchpad",
    "repository-name": slug || "my-launchpad",
    env: DEPLOY_ENV.join(","),
    envDescription: "Paste the configuration you just copied, plus a free Pinata key so people can upload coin images.",
    // The template repo's own README explains the two values; it is public (that is what makes the
    // clone work at all), so this link on Vercel's form always resolves.
    envLink: `${TEMPLATE_REPO}#two-values-youll-be-asked-for`,
  });
  return `https://vercel.com/new/clone?${q.toString()}`;
}

/// A brand-free hero backdrop, shipped in public/. The alternative — DEFAULT_CONFIG.kothBgUrl — is
/// prynt's photograph, and a fork serves it for real.
const NEUTRAL_KOTH_BG = "/koth-bg-neutral.svg";

/// `seoSchema` validates each keyword with `text(48)`.
const KEYWORD_MAX = 48;

/// Vercel's per-variable ceiling is 4KB; past that the value is silently truncated at deploy time
/// and the failure surfaces as a parse error on a live site. We warn well before it.
const ENV_VALUE_LIMIT = 4096;

/// base64url of the UTF-8 JSON. Chosen over plain JSON because this value has to survive a Vercel
/// textarea, a .env file (no newlines allowed) AND a shell `export` (no quotes or braces) — base64url
/// has no character that is significant to any of the three, is one unbroken token, and truncation
/// always fails the decode instead of parsing into something half-right.
export function encodeLaunchpadConfig(config: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/// Only the tokens a human set. Absent means "follow the preset", which is why these are optional
/// rather than prefilled: a value exists only once the creator has deliberately moved it.
type Overrides = {
  bg?: string;
  surface?: string;
  text?: string;
  textMuted?: string;
  ink?: string;
  up?: string;
  down?: string;
  hot?: string;
  fontId?: string;
  cornerId?: string;
};

/// SEO copy the creator typed. Every field is optional and an empty string means "derive it", so the
/// fast path never has to visit this group and the derived values stay live as the tagline changes.
type SeoDraft = {
  title: string;
  description: string;
  keywords: string;
  twitterHandle: string;
  ogTagline: string;
  /// When true the four social-card colours follow the theme. Off means the four fields below win.
  ogMatchTheme: boolean;
  ogAccent: string;
  ogBackground: string;
  ogTextPrimary: string;
  ogTextSecondary: string;
};

type LinksDraft = { twitter: string; telegram: string; docs: string; defillama: string };

type Draft = {
  name: string;
  slug: string;
  slugTouched: boolean;
  tagline: string;
  logoUrl: string;
  kothBgUrl: string;
  faviconUrl: string;
  tld: string;
  presetId: string;
  accent: string;
  ov: Overrides;
  links: LinksDraft;
  seo: SeoDraft;
  showWhitepaper: boolean;
  /// Where the operator's deployment will actually live. Only the export path uses it; the hosted
  /// path has the server pin it. See the note on the field itself for why it cannot be derived.
  siteUrl: string;
};

const EMPTY_SEO: SeoDraft = {
  title: "",
  description: "",
  keywords: "",
  twitterHandle: "",
  ogTagline: "",
  ogMatchTheme: true,
  ogAccent: "",
  ogBackground: "",
  ogTextPrimary: "",
  ogTextSecondary: "",
};

const EMPTY_LINKS: LinksDraft = { twitter: "", telegram: "", docs: "", defillama: "" };

// ------------------------------------------------------------------------------------------------
//                              CLOSED LISTS — schema-safe by construction
// ------------------------------------------------------------------------------------------------

/// A suffix is a WORDMARK, not a domain: it renders in the sidebar, the page title and the OG card.
/// The default is empty on purpose. The wizard used to hard-code ".fun", which made every tenant
/// print a live claim on a domain owned by somebody else two rows above its real address.
const TLDS = ["", ".fun", ".xyz", ".market", ".money", ".wtf", ".lol"];

/// `fontStack` (launchpad-schema.ts) rejects "(" outright, which kills url(), local() and format() —
/// a "paste a Google Fonts URL" field is impossible by design, so this is a closed list. Every stack
/// resolves from the system: a launchpad must render without a web-font download.
const FONTS: { id: string; label: string; stack: string }[] = [
  {
    id: "default",
    label: "Satoshi — the platform default",
    stack: "'Satoshi', -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Inter, system-ui, sans-serif",
  },
  { id: "grotesk", label: "Grotesk — neutral, tight", stack: "Inter, \"Helvetica Neue\", Helvetica, Arial, system-ui, sans-serif" },
  { id: "geometric", label: "Geometric — wide, confident", stack: "\"Avenir Next\", Avenir, \"Century Gothic\", Futura, system-ui, sans-serif" },
  { id: "rounded", label: "Rounded — soft, playful", stack: "ui-rounded, \"SF Pro Rounded\", Quicksand, \"Hiragino Maru Gothic ProN\", system-ui, sans-serif" },
  { id: "serif", label: "Serif — editorial", stack: "\"Iowan Old Style\", \"Palatino Linotype\", Palatino, Georgia, \"Times New Roman\", serif" },
  { id: "mono", label: "Mono — terminal", stack: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace" },
  { id: "condensed", label: "Condensed — loud headlines", stack: "\"Arial Narrow\", Oswald, Haettenschweiler, Impact, system-ui, sans-serif" },
];

/// `cssLength` requires a unit, so a slider whose zero position emits "0" is a 400 and a free slider
/// is simply the wrong control. Three named scales span the range the six presets already cover.
type Radii = Pick<LaunchpadTheme, "radiusXs" | "radiusSm" | "radiusMd" | "radiusLg" | "radiusCard" | "radiusPill">;
const CORNERS: { id: string; label: string; radii: Radii }[] = [
  { id: "sharp", label: "Sharp", radii: { radiusXs: "2px", radiusSm: "2px", radiusMd: "2px", radiusLg: "4px", radiusCard: "2px", radiusPill: "4px" } },
  { id: "soft", label: "Soft", radii: { radiusXs: "6px", radiusSm: "8px", radiusMd: "10px", radiusLg: "16px", radiusCard: "12px", radiusPill: "999px" } },
  { id: "round", label: "Round", radii: { radiusXs: "10px", radiusSm: "14px", radiusMd: "16px", radiusLg: "24px", radiusCard: "20px", radiusPill: "999px" } },
];

// ------------------------------------------------------------------------------------------------
//                                          COLOUR MATHS
// ------------------------------------------------------------------------------------------------
//
// Hardened on purpose: theme-presets.ts's own parseHex understands 3- and 6-digit hex only and FAILS
// OPEN (returns its input unchanged) on #rrggbbaa and rgb(), both of which the zod `colour` grammar
// accepts. This parser understands every form the schema allows, and the controls below additionally
// refuse to emit anything but #RRGGBB, so the derived accent family can never silently collapse.

function parseColour(v: string): [number, number, number] | null {
  const s = v.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const full =
      h.length === 3 || h.length === 4
        ? h.slice(0, 3).split("").map((c) => c + c).join("")
        : h.length === 6 || h.length === 8
          ? h.slice(0, 6)
          : "";
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,[^)]*)?\)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex2 = (n: number) => clampByte(n).toString(16).padStart(2, "0");
const toHex = (rgb: [number, number, number]) => `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`.toUpperCase();

/// A 6-digit hex for `<input type="color">`, which cannot display any other form.
function asPickerHex(v: string, fallback: string): string {
  const rgb = parseColour(v);
  return rgb ? toHex(rgb).toLowerCase() : fallback;
}

/// Literal hex, never color-mix(): the validator only accepts literal colours, and Satori (the OG
/// renderer) does not implement color-mix — a colour expressed that way renders black on every
/// shared link. Same reasoning as accentFamily in theme-presets.ts, and the same obligation.
function mix(a: string, b: string, t: number): string {
  const A = parseColour(a);
  const B = parseColour(b);
  if (!A || !B) return a;
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/// `rgba(r, g, b, a)` shaped exactly as the schema's RGB regex demands: "1.0" is a 400, ".5" and
/// "0.5" both pass, and space-separated `rgb(0 0 0)` is rejected — so the alpha is built here, once.
function alpha(c: string, a: number): string {
  const rgb = parseColour(c);
  if (!rgb) return c;
  const v = Math.max(0, Math.min(1, a));
  const s = v === 0 ? "0" : v === 1 ? "1" : String(Number(v.toFixed(3)));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${s})`;
}

function luminance(c: string): number {
  const rgb = parseColour(c);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/// Black or white, whichever reads better on `c`. Offered as an "Auto" button on `ink`, the on-accent
/// foreground — `ink` is a constant #FFFFFF in five of the six presets, so a creator who picks a pale
/// accent gets white-on-pale button labels with nothing in the UI to tell them.
function autoInk(c: string): string {
  return contrast(c, "#FFFFFF") >= contrast(c, "#0B0B0B") ? "#FFFFFF" : "#0B0B0B";
}

// ------------------------------------------------------------------------------------------------
//                                       THEME COMPOSITION
// ------------------------------------------------------------------------------------------------

/// The chrome/border/depth family, recomputed from bg + text. Every preset relates these tokens to
/// its own background mechanically — the dark ones carry black-heavy shadows, the light ones
/// barely-there ones — so the moment a creator moves bg, the preset's authored greys stop being the
/// right greys and a hand-tuned dark canvas would keep a white sidebar.
function neutrals(bg: string, text: string, textMuted: string, dark: boolean) {
  const lift = dark ? "#FFFFFF" : "#000000";
  const border = mix(bg, text, 0.12);
  return {
    surface: dark ? mix(bg, lift, 0.05) : bg,
    surface2: mix(bg, lift, dark ? 0.09 : 0.04),
    border,
    borderSoft: alpha(text, dark ? 0.07 : 0.06),
    textSubtle: mix(textMuted, bg, 0.35),
    chrome: mix(bg, lift, dark ? 0.03 : 0.02),
    chromeBar: alpha(bg, 0.85),
    hover: mix(bg, lift, dark ? 0.08 : 0.05),
    track: mix(bg, lift, dark ? 0.12 : 0.08),
    control: mix(bg, lift, dark ? 0.2 : 0.16),
    dividerStrong: mix(bg, text, 0.16),
    overlay: alpha(dark ? "#000000" : text, dark ? 0.55 : 0.3),
    ring: `0 0 0 1px ${border}`,
    ringHover: `0 0 0 1px ${mix(bg, text, 0.22)}`,
    shadowSm: dark ? "0 1px 2px rgba(0, 0, 0, .40)" : "0 1px 2px rgba(0, 0, 0, .05)",
    shadowMd: dark ? "0 6px 20px rgba(0, 0, 0, .55)" : "0 6px 20px rgba(0, 0, 0, .08)",
    shadowLg: dark ? "0 24px 60px rgba(0, 0, 0, .65)" : "0 24px 60px rgba(0, 0, 0, .14)",
    glow: dark ? "0 8px 24px rgba(0, 0, 0, .55)" : "0 8px 24px rgba(0, 0, 0, .10)",
  };
}

/// preset -> accent family -> the creator's overrides -> the tokens those overrides imply. Pure, and
/// the ONLY place this wizard turns a draft into a theme, so the live preview, the validation gate
/// and the exported config cannot disagree with each other.
export function composeDraftTheme(presetId: string, accent: string, ov: Overrides): LaunchpadTheme {
  const base = themeFromPreset(presetId, accent);
  const bg = ov.bg ?? base.bg;
  const text = ov.text ?? base.text;
  const textMuted = ov.textMuted ?? base.textMuted;

  const t: LaunchpadTheme = { ...base, bg, text, textMuted };

  // Rebuild the greys only when the canvas itself moved. Touching textMuted alone must not throw
  // away a preset's hand-authored borders.
  if (ov.bg !== undefined || ov.text !== undefined) {
    Object.assign(t, neutrals(bg, text, textMuted, luminance(bg) < 0.42));
  } else if (ov.textMuted !== undefined) {
    t.textSubtle = mix(textMuted, bg, 0.35);
  }

  // Straight overrides last, so an explicit choice always wins over a derived one.
  if (ov.surface !== undefined) t.surface = ov.surface;
  if (ov.ink !== undefined) t.ink = ov.ink;
  if (ov.up !== undefined) t.up = ov.up;
  if (ov.down !== undefined) t.down = ov.down;
  if (ov.hot !== undefined) t.hot = ov.hot;

  const font = FONTS.find((f) => f.id === ov.fontId);
  if (font) t.fontSans = font.stack;
  const corner = CORNERS.find((c) => c.id === ov.cornerId);
  if (corner) Object.assign(t, corner.radii);

  return t;
}

// ------------------------------------------------------------------------------------------------
//                                       TEXT NORMALISATION
// ------------------------------------------------------------------------------------------------

/// The schema's private `text()` helper strips `<` and `>` rather than rejecting them (so "A < B" in
/// a tagline is not blocked). That transform is applied on the way IN, which means a field that does
/// not mirror it appears to silently edit itself after export. The helper is not exported from
/// launchpad-schema.ts and that file is not ours to change, so it is mirrored here — and the
/// authoritative pass is still launchpadConfigSchema, run over the whole config before anything
/// leaves this screen.
const stripAngles = (v: string) => v.replace(/[<>]/g, "");

/// Blank optional strings must be omitted, not sent as "". `linksSchema` marks every link optional
/// and `safeUrl` rejects "" — an empty box is "no link", not "a link that is the empty string".
const omitBlank = (v: string) => {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  slug: "",
  slugTouched: false,
  tagline: "",
  logoUrl: "",
  kothBgUrl: "",
  faviconUrl: "",
  tld: "",
  presetId: DEFAULT_PRESET_ID,
  accent: getPreset(DEFAULT_PRESET_ID).theme.accent,
  ov: {},
  links: EMPTY_LINKS,
  seo: EMPTY_SEO,
  showWhitepaper: false,
  siteUrl: "",
};

/// The draft survives a refresh, so a wallet pop-up that steals focus and reloads the tab — or a
/// closed laptop — does not erase ten minutes of design. Stored on every change (debounced by React's
/// own batching), cleared once the launchpad is claimed. A stored draft from an older shape is run
/// through the same defaults spread, so a new field added later reads as its default rather than
/// undefined; anything that still does not compose is caught by themeError downstream, not here.
const DRAFT_KEY = "prynt.launchpad.draft.v1";

function loadDraft(): Draft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const saved = JSON.parse(raw) as Partial<Draft>;
    // Merge, and merge the NESTED objects too. A shallow spread would let a stored `seo: {}` or a
    // draft written before a field existed replace the full default with a hole, and the first render
    // that read `draft.seo.<missing>` would throw. Nested spread makes any absent key read as its
    // default instead — the stale-draft robustness the flow needs to survive a schema that grew.
    return {
      ...EMPTY_DRAFT,
      ...saved,
      ov: { ...(saved.ov ?? {}) },
      seo: { ...EMPTY_SEO, ...(saved.seo ?? {}) },
      links: { ...EMPTY_LINKS, ...(saved.links ?? {}) },
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function CreateLaunchpadWizard({ hosted = true }: { apex?: string; hosted?: boolean }) {
  const toast = useToast();
  const [step, setStep] = useState<Step>(1);
  // Start from EMPTY_DRAFT so the server render and the first client render agree; the stored draft
  // is hydrated in an effect right after mount, which cannot cause a hydration mismatch.
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [restored, setRestored] = useState(false);
  const [slugState, setSlugState] = useState<{ status: "idle" | "checking" | "ok" | "bad"; reason?: string }>({ status: "idle" });
  const [uploading, setUploading] = useState<null | "logo" | "koth" | "favicon">(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ slug: string; url: string } | null>(null);

  const theme = useMemo(
    () => composeDraftTheme(draft.presetId, draft.accent, draft.ov),
    [draft.presetId, draft.accent, draft.ov],
  );

  // The browser's last line of defence, run against the very schema the API runs. If this ever
  // reports a problem the creator reads it here, before signing or exporting, instead of as a 400 —
  // or, worse on the self-host path, as a deployment that refuses to boot.
  const themeError = useMemo(() => {
    const r = themeSchema.safeParse(theme);
    if (r.success) return null;
    const i = r.error.issues[0];
    return `${i.path.join(".")}: ${i.message}`;
  }, [theme]);

  // Restore the saved draft once, after mount. Then persist on every change. Cleared on success.
  useEffect(() => {
    const saved = loadDraft();
    if (saved.name || saved.slug || saved.logoUrl) setDraft(saved);
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return; // do not overwrite storage with the empty draft before restore runs
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode / quota — the draft simply is not persisted, which is not worth interrupting for */
    }
  }, [draft, restored]);

  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const setLink = useCallback(
    (patch: Partial<LinksDraft>) => setDraft((d) => ({ ...d, links: { ...d.links, ...patch } })),
    [],
  );
  const setSeo = useCallback((patch: Partial<SeoDraft>) => setDraft((d) => ({ ...d, seo: { ...d.seo, ...patch } })), []);

  /// An `undefined` value means "back to the preset": the key is deleted rather than stored as a
  /// hole, so `Object.keys(ov).length` stays an honest count of what the creator has changed.
  const setOv = useCallback(
    (patch: Overrides) =>
      setDraft((d) => {
        const ov: Overrides = { ...d.ov, ...patch };
        for (const k of Object.keys(patch) as (keyof Overrides)[]) if (patch[k] === undefined) delete ov[k];
        return { ...d, ov };
      }),
    [],
  );

  // Slug follows the name until the user edits it themselves. Gated on `restored`: on the mount
  // render slugTouched is still false, so without this gate the auto-slug's functional setDraft would
  // run in the same batch as the restore and clobber a restored handle back to "".
  useEffect(() => {
    if (restored && !draft.slugTouched) {
      const auto = slugify(draft.name);
      setDraft((d) => (d.slug === auto ? d : { ...d, slug: auto }));
    }
  }, [restored, draft.name, draft.slugTouched]);

  // Debounced availability check. The local shape check runs first so an obviously bad slug never
  // costs a request. On a deployment with no launchpads database the endpoint answers "available"
  // for everything, which is why availability GATES ONLY the hosted path (see `hostedReady`) and
  // never the export path — there is no registry to be unique against when you self-host.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!draft.slug.trim()) return setSlugState({ status: "idle" });

    // SHAPE only, deliberately. The other half of checkSlug is RESERVED_SLUGS, which protects the
    // platform's `*.prynt.fun` namespace — a namespace an operator who exports and self-hosts does
    // not share. Reservedness is a registry concern exactly like availability, so it is enforced by
    // the same thing that enforces availability: the hosted check below (and POST /api/launchpads).
    const shape = checkSlugShape(draft.slug);
    if (!shape.ok) return setSlugState({ status: "bad", reason: shape.reason });
    const slug = shape.slug;

    if (!hosted) return setSlugState({ status: "ok" });

    setSlugState({ status: "checking" });
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/launchpads/check-slug?slug=${encodeURIComponent(slug)}`);
        const j = (await res.json()) as { available: boolean; reason?: string };
        setSlugState(j.available ? { status: "ok" } : { status: "bad", reason: j.reason ?? "Not available" });
      } catch {
        setSlugState({ status: "bad", reason: "Could not check right now" });
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [draft.slug, hosted]);

  const upload = useCallback(
    async (file: File, kind: "logo" | "koth" | "favicon", apply: (url: string) => void) => {
      setUploading(kind);
      try {
        const fd = new FormData();
        // "image" — the field name app/api/upload/route.ts:73 actually reads. Sending "file" (what
        // this did) pinned an EMPTY metadata document, answered 200 with imageUrl "" and surfaced as
        // "Upload failed: upload failed": every logo, banner and favicon upload in the designer was
        // a no-op. Harmless while the logo was optional; a dead end the moment it is required.
        fd.append("image", file);
        // Reuses the existing Pinata route — one upload path for the whole product. It is also the
        // only path: `safeUrl` rejects data: URIs, so a drag-and-drop that inlined the bytes could
        // never produce a storable value (and would blow the env-var size ceiling if it could).
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const j = (await res.json()) as { imageUrl?: string; error?: string };
        if (!res.ok || !j.imageUrl) throw new Error(j.error ?? "upload failed");
        apply(j.imageUrl);
      } catch (e) {
        toast.error(`Upload failed: ${(e as Error).message}`);
      } finally {
        setUploading(null);
      }
    },
    [toast],
  );

  // Shape only. Availability AND reservedness are hosted-path concerns, checked separately.
  const slugShapeOk = checkSlugShape(draft.slug).ok;
  // The logo is a precondition, not a nicety: with it blank the exported config used to carry
  // prynt's own mark ("/pryntlogo-nobg.png", a file that exists in the fork and renders for real),
  // so an operator shipped somebody else's brand on their own domain. And "add it later" is not
  // true off the platform — later means regenerate the config and redeploy.
  const step1Valid = draft.name.trim().length >= 2 && slugShapeOk && !!draft.logoUrl;

  // The work is claimed and saved server-side; the local draft has done its job and is cleared so a
  // later visit starts clean rather than re-loading a launchpad that already exists.
  if (created) {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    return <DeployScreen draft={draft} theme={theme} handle={created.slug} />;
  }

  return (
    <div className="lp-wizard">
      <div className="lp-wizard-form">
        <Steps step={step} />

        {step === 1 && (
          <section className="lp-step">
            <h2>Brand</h2>
            <p className="lp-step-hint">This is what traders see first. Name it, add your logo, make it yours.</p>

            <label htmlFor="lp-name">Name</label>
            <div className="lp-tld-row">
              <input
                id="lp-name"
                value={draft.name}
                maxLength={32}
                placeholder="e.g. moonshot"
                aria-describedby="lp-tld-help"
                onChange={(e) => set({ name: stripAngles(e.target.value) })}
              />
              <select id="lp-tld" aria-label="Wordmark suffix" value={draft.tld} onChange={(e) => set({ tld: e.target.value })}>
                {TLDS.map((t) => (
                  <option key={t || "none"} value={t}>
                    {t || "no suffix"}
                  </option>
                ))}
              </select>
            </div>
            <p id="lp-tld-help" className="note lp-adv-note">
              The brand traders will see. You can change it anytime.
              <InfoTip label="About the suffix">
                The suffix is part of your wordmark — it shows in the sidebar, the page title and your share cards. Pick
                one or leave it blank; it does not have to match your handle.
              </InfoTip>
            </p>

            <label htmlFor="lp-slug">Handle</label>
            <div className="lp-slug-row">
              <input
                id="lp-slug"
                value={draft.slug}
                maxLength={32}
                placeholder="moonshot"
                onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })}
                className={slugState.status === "bad" ? "input-err" : ""}
                aria-describedby="lp-slug-help"
              />
            </div>
            <SlugStatus state={slugState} hosted={hosted} />
            <p id="lp-slug-help" className="note lp-slug-help">
              Your permanent on-chain signature — every coin you launch carries it.
              <InfoTip label="About your handle">
                Lowercase letters, numbers and dashes. It is written into each coin&rsquo;s on-chain metadata as the site
                it launched from, so it travels with the coin everywhere.
              </InfoTip>
            </p>

            <label htmlFor="lp-tagline">Tagline</label>
            <input
              id="lp-tagline"
              value={draft.tagline}
              maxLength={140}
              placeholder="Launch a coin in seconds."
              onChange={(e) => set({ tagline: stripAngles(e.target.value) })}
            />

            <label>Logo</label>
            <div className="lp-logo-row">
              <label className="avatar-pick lp-logo-pick">
                {draft.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.logoUrl} alt="" />
                ) : (
                  <span>{uploading === "logo" ? "…" : "+ logo"}</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  aria-describedby="lp-logo-help"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, "logo", (url) => set({ logoUrl: url }));
                  }}
                />
              </label>
              <span className="note" id="lp-logo-help">
                Square PNG or SVG. This is your mark — sidebar, tab, share cards.
              </span>
            </div>

            <div className="lp-actions">
              <button disabled={!step1Valid} onClick={() => setStep(2)}>
                Continue
              </button>
              {draft.name.trim().length >= 2 && slugShapeOk && !draft.logoUrl && (
                <span className="note">Add a logo to continue.</span>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="lp-step">
            <h2>Look</h2>
            <p className="lp-step-hint">
              Pick a theme, then your accent colour. Watch the preview change — everything else is optional.
            </p>

            <div className="lp-presets">
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`lp-preset${draft.presetId === p.id ? " active" : ""}`}
                  // Picking a preset is a fresh start: it clears the per-token overrides too, so the
                  // tile the creator just clicked is exactly what they get.
                  onClick={() => setDraft((d) => ({ ...d, presetId: p.id, accent: p.theme.accent, ov: {} }))}
                >
                  <span className="lp-preset-swatch" style={{ background: p.swatch.bg }}>
                    <span style={{ background: p.swatch.surface }} />
                    <span style={{ background: p.swatch.accent }} />
                  </span>
                  <span className="lp-preset-meta">
                    <strong>{p.label}</strong>
                    <small>{p.blurb}</small>
                  </span>
                </button>
              ))}
            </div>

            {/* The SAME control as every advanced colour, and for the same reason: an operator with
                a brand hex must be able to paste it. This was the one colour in the wizard with no
                text box — a bare swatch plus a read-only <code> — so the most important colour was
                the only one you had to hunt for in the OS colour dialog. */}
            <div className="lp-accent-row">
              <ColourField
                id="accent"
                label="Accent colour"
                value={draft.accent}
                preset={getPreset(draft.presetId).theme.accent}
                overridden={draft.accent !== getPreset(draft.presetId).theme.accent}
                onSet={(v) => set({ accent: v ?? getPreset(draft.presetId).theme.accent })}
              />
            </div>

            {/* OUTSIDE the Advanced disclosure, on purpose. These warnings used to live inside a
                <details> that is collapsed by default, so the fast path — pick a preset, pick an
                accent, export — never saw them, which is precisely the path that produces an
                unreadable button label. */}
            <ContrastWarnings theme={theme} />

            <AdvancedPanel
              draft={draft}
              theme={theme}
              setOv={setOv}
              set={set}
              setLink={setLink}
              setSeo={setSeo}
              uploading={uploading}
              upload={upload}
            />

            {themeError && (
              <p className="field-err lp-adv-note" role="alert">
                One colour needs a fix ({themeError}). Reset that field to continue.
              </p>
            )}

            <div className="lp-actions">
              <button className="secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button onClick={() => setStep(3)} disabled={!!themeError}>
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <LaunchStep
            draft={draft}
            theme={theme}
            hosted={hosted}
            hostedReady={slugState.status === "ok"}
            submitting={submitting}
            setSubmitting={setSubmitting}
            onDone={(slug, url) => setCreated({ slug, url })}
            onBack={() => setStep(2)}
          />
        )}
      </div>

      <aside className="lp-wizard-preview">
        <div className="lp-preview-label">Live preview</div>
        {/* All nine props. The full-page stage falls back to DEFAULT_CONFIG for anything it is not
            given, which meant the wizard's own "See it full-page" used to show prynt's tagline,
            prynt's King-of-the-Hill artwork and prynt's feature flags under the creator's brand. */}
        <ThemePreview
          theme={theme}
          name={draft.name || "your"}
          tld={previewTld(draft.tld)}
          logoUrl={draft.logoUrl || undefined}
          tagline={draft.tagline || undefined}
          kothBgUrl={draft.kothBgUrl || undefined}
          links={draftLinks(draft)}
          features={draftFeatures(draft)}
          slug={draft.slug || undefined}
        />
      </aside>
    </div>
  );
}

/// ThemePreview renders `tld || ".fun"`, so an empty suffix would draw a suffix the creator did not
/// choose — the exact lie this wizard just stopped telling. A zero-width space is truthy and renders
/// nothing, which keeps the preview honest without reaching into a component this surface does not
/// own. See the report: ThemePreview should treat "" as "" and this shim then goes away.
function previewTld(tld: string): string {
  return tld || "​";
}

/// Only the three flags with readers stay honest. showKingOfHill, showLeaderboard and networkFeed
/// are read NOWHERE in the app (grep: they appear only in the config, the schema and the dashboard),
/// so a toggle for them would be a switch that does nothing — they are pinned true and not exposed.
function draftFeatures(draft: Draft): LaunchpadFeatures {
  return { showKingOfHill: true, showLeaderboard: true, showWhitepaper: draft.showWhitepaper, networkFeed: true };
}

function draftLinks(draft: Draft): LaunchpadLinks {
  return {
    twitter: omitBlank(draft.links.twitter),
    telegram: omitBlank(draft.links.telegram),
    docs: omitBlank(draft.links.docs),
    defillama: omitBlank(draft.links.defillama),
  };
}

// ------------------------------------------------------------------------------------------------
//                                     ADVANCED DISCLOSURE
// ------------------------------------------------------------------------------------------------

/// Collapsed by default and never on the critical path: nothing in here blocks anything, and every
/// field has a working default.
///
/// The order is by how often a real operator touches it, and the split has one rule behind it: if
/// the live preview does not visibly change when you touch a control, that control goes below Links.
/// Colours and Type change how the site LOOKS and the creator is already staring at a preview;
/// Links and Search & sharing change what it SAYS, which nobody writes in the first sitting.
function AdvancedPanel({
  draft,
  theme,
  setOv,
  set,
  setLink,
  setSeo,
  uploading,
  upload,
}: {
  draft: Draft;
  theme: LaunchpadTheme;
  setOv: (patch: Overrides) => void;
  set: (patch: Partial<Draft>) => void;
  setLink: (patch: Partial<LinksDraft>) => void;
  setSeo: (patch: Partial<SeoDraft>) => void;
  uploading: null | "logo" | "koth" | "favicon";
  upload: (file: File, kind: "logo" | "koth" | "favicon", apply: (url: string) => void) => void;
}) {
  const base = useMemo(() => themeFromPreset(draft.presetId, draft.accent), [draft.presetId, draft.accent]);
  const ov = draft.ov;

  // "n changed" has to count everything under the disclosure, not just theme tokens, or the badge
  // silently under-reports the moment somebody fills in a link and collapses the panel.
  const touched =
    Object.keys(ov).length +
    (draft.kothBgUrl ? 1 : 0) +
    (draft.faviconUrl ? 1 : 0) +
    (draft.showWhitepaper ? 1 : 0) +
    Object.values(draft.links).filter(Boolean).length +
    (draft.seo.title ? 1 : 0) +
    (draft.seo.description ? 1 : 0) +
    (draft.seo.keywords ? 1 : 0) +
    (draft.seo.twitterHandle ? 1 : 0) +
    (draft.seo.ogTagline ? 1 : 0) +
    (draft.seo.ogMatchTheme ? 0 : 1);

  const og = ogColours(draft, theme);

  // Keywords are the only free-text list here, and each ITEM is `text(48)`. Flagged inline, next to
  // the box, rather than surfacing two steps later as `seo.keywords.0` — a path naming a field that
  // is not on screen. buildConfig also truncates, so this is advice, never a dead end.
  const longKeywords = draft.seo.keywords
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > KEYWORD_MAX);

  return (
    <details className="lp-adv">
      <summary>
        <span>Advanced — colours, type, pictures, links, search</span>
        {touched > 0 && <span className="lp-adv-count">{touched} changed</span>}
      </summary>

      <div className="lp-adv-body">
        {/* ---- 1. COLOURS ------------------------------------------------------------------ */}
        <div className="lp-adv-group">
          <h4>Colours</h4>
          <p className="note lp-adv-note">
            Moving the background or the text colour also rebuilds the borders, the sidebar grey and the shadow depth
            to match — those are derived, not four more pickers.
          </p>
          <div className="lp-adv-fields">
            <ColourField id="bg" label="Page background" value={theme.bg} preset={base.bg} overridden={ov.bg !== undefined} onSet={(v) => setOv({ bg: v })} />
            <ColourField id="surface" label="Card colour" value={theme.surface} preset={base.surface} overridden={ov.surface !== undefined} onSet={(v) => setOv({ surface: v })} />
            <ColourField id="text" label="Text colour" value={theme.text} preset={base.text} overridden={ov.text !== undefined} onSet={(v) => setOv({ text: v })} />
            <ColourField id="textMuted" label="Secondary text" value={theme.textMuted} preset={base.textMuted} overridden={ov.textMuted !== undefined} onSet={(v) => setOv({ textMuted: v })} />
            <ColourField
              id="ink"
              label="Text on buttons"
              value={theme.ink}
              preset={base.ink}
              overridden={ov.ink !== undefined}
              onSet={(v) => setOv({ ink: v })}
              extra={
                <button type="button" className="secondary lp-adv-mini" onClick={() => setOv({ ink: autoInk(theme.accent) })}>
                  Auto
                </button>
              }
            />
            <ColourField id="up" label="Price up / buy" value={theme.up} preset={base.up} overridden={ov.up !== undefined} onSet={(v) => setOv({ up: v })} />
            <ColourField id="down" label="Price down / sell" value={theme.down} preset={base.down} overridden={ov.down !== undefined} onSet={(v) => setOv({ down: v })} />
            <ColourField id="hot" label="Trending highlight" value={theme.hot} preset={base.hot} overridden={ov.hot !== undefined} onSet={(v) => setOv({ hot: v })} />
          </div>
        </div>

        {/* ---- 2. TYPE & SHAPE -------------------------------------------------------------- */}
        <div className="lp-adv-group">
          <h4>Type &amp; shape</h4>
          <label htmlFor="lp-font">Typeface</label>
          <select id="lp-font" value={ov.fontId ?? "default"} onChange={(e) => setOv({ fontId: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="note lp-adv-note">
            System fonts only, so your launchpad loads instantly — no web-font download.
          </p>

          <label id="lp-corners-label" className="lp-adv-sublabel">
            Corners
          </label>
          <div className="lp-adv-seg" role="group" aria-labelledby="lp-corners-label">
            <button type="button" className={ov.cornerId === undefined ? "active" : ""} aria-pressed={ov.cornerId === undefined} onClick={() => setOv({ cornerId: undefined })}>
              Preset
            </button>
            {CORNERS.map((c) => (
              <button key={c.id} type="button" className={ov.cornerId === c.id ? "active" : ""} aria-pressed={ov.cornerId === c.id} onClick={() => setOv({ cornerId: c.id })}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- 3. PICTURES ------------------------------------------------------------------ */}
        <div className="lp-adv-group">
          <h4>Pictures</h4>
          <p className="note lp-adv-note">
            Uploaded to IPFS, the same place your coins&rsquo; images live.
          </p>
          <div className="lp-adv-uploads">
            <UploadField
              id="koth"
              label="Hero banner image"
              hint="Sits behind the top coin at the head of your board. Wide, roughly 3:1."
              value={draft.kothBgUrl}
              busy={uploading === "koth"}
              onPick={(f) => upload(f, "koth", (url) => set({ kothBgUrl: url }))}
              onClear={() => set({ kothBgUrl: "" })}
            />
            <UploadField
              id="favicon"
              label="Browser tab icon"
              hint="The little square in the browser tab. Square PNG, 64px or larger."
              value={draft.faviconUrl}
              busy={uploading === "favicon"}
              onPick={(f) => upload(f, "favicon", (url) => set({ faviconUrl: url }))}
              onClear={() => set({ faviconUrl: "" })}
            />
          </div>

          <label className="lp-adv-sublabel" htmlFor="lp-wp">
            <input
              id="lp-wp"
              type="checkbox"
              checked={draft.showWhitepaper}
              onChange={(e) => set({ showWhitepaper: e.target.checked })}
            />{" "}
            Show the whitepaper page
          </label>
          <p className="note lp-adv-note">
            Off by default. The bundled whitepaper describes this app&rsquo;s contracts and fee split — turn it on if you
            are happy to publish it under your brand.
          </p>
        </div>

        {/* ---- 4. LINKS --------------------------------------------------------------------- */}
        <div className="lp-adv-group">
          <h4>Links</h4>
          <p className="note lp-adv-note">
            These appear in your footer. Leave a box empty and the link simply does not render.
          </p>
          <div className="lp-adv-fields">
            <UrlField id="lk-twitter" label="X (Twitter)" placeholder="https://x.com/yourhandle" value={draft.links.twitter} onSet={(v) => setLink({ twitter: v })} />
            <UrlField id="lk-telegram" label="Telegram" placeholder="https://t.me/yourgroup" value={draft.links.telegram} onSet={(v) => setLink({ telegram: v })} />
            <UrlField id="lk-docs" label="Docs" placeholder="https://docs.example.com" value={draft.links.docs} onSet={(v) => setLink({ docs: v })} />
            <UrlField
              id="lk-defillama"
              label="DefiLlama listing"
              placeholder="https://defillama.com/protocol/…"
              value={draft.links.defillama}
              onSet={(v) => setLink({ defillama: v })}
            />
          </div>
          <p className="note lp-adv-note">
            Add this only if the listing is genuinely yours — it is published to search engines as a page you own.
          </p>
        </div>

        {/* ---- 5. SEARCH & SHARING ---------------------------------------------------------- */}
        <div className="lp-adv-group">
          <h4>Search &amp; sharing</h4>
          <p className="note lp-adv-note">
            How your site reads in Google and how it looks pasted into a chat. Every box here writes itself from your
            name and tagline if you leave it alone.
          </p>

          <label htmlFor="lp-seo-title">Page title</label>
          <input
            id="lp-seo-title"
            value={draft.seo.title}
            maxLength={120}
            placeholder={derivedTitle(draft)}
            onChange={(e) => setSeo({ title: stripAngles(e.target.value) })}
          />

          <label htmlFor="lp-seo-desc">Search description</label>
          <textarea
            id="lp-seo-desc"
            rows={3}
            value={draft.seo.description}
            maxLength={300}
            placeholder={derivedDescription(draft)}
            onChange={(e) => setSeo({ description: stripAngles(e.target.value) })}
          />

          <label htmlFor="lp-seo-kw">Keywords</label>
          <input
            id="lp-seo-kw"
            value={draft.seo.keywords}
            placeholder={derivedKeywords(draft).join(", ")}
            aria-describedby="lp-seo-kw-help"
            onChange={(e) => setSeo({ keywords: stripAngles(e.target.value) })}
          />
          <p id="lp-seo-kw-help" className="note lp-adv-note">
            Separated by commas. Up to 20, each at most {KEYWORD_MAX} characters; blanks are dropped rather than
            published as an empty entry.
          </p>
          {longKeywords.length > 0 && (
            <p className="field-err lp-adv-note" role="status">
              {longKeywords.length === 1 ? "One keyword is" : `${longKeywords.length} keywords are`} longer than{" "}
              {KEYWORD_MAX} characters and will be shortened: &ldquo;{longKeywords[0].slice(0, KEYWORD_MAX)}…&rdquo;
            </p>
          )}

          <label htmlFor="lp-seo-x">X handle</label>
          <input
            id="lp-seo-x"
            value={draft.seo.twitterHandle}
            maxLength={32}
            placeholder="@yourhandle"
            aria-describedby="lp-seo-x-help"
            // Normalised on BLUR, not on change. Rewriting the value on every keystroke makes the
            // field impossible to type into: pasting "https://x.com/me" one character at a time
            // means the URL never exists long enough to be recognised, and every keypress lands
            // after a "@" the control just inserted.
            onChange={(e) => setSeo({ twitterHandle: stripAngles(e.target.value) })}
            onBlur={(e) => setSeo({ twitterHandle: normalizeHandle(e.target.value) })}
          />
          <p id="lp-seo-x-help" className="note lp-adv-note">
            Just the handle — paste a full URL and we trim it for you. X shows this on your share cards.
          </p>

          <label htmlFor="lp-seo-ogtag">Small line on your share card</label>
          <input
            id="lp-seo-ogtag"
            value={draft.seo.ogTagline}
            maxLength={140}
            placeholder={DEFAULT_CONFIG.seo.ogTagline}
            onChange={(e) => setSeo({ ogTagline: stripAngles(e.target.value) })}
          />

          <label className="lp-adv-sublabel" htmlFor="lp-og-match">
            <input
              id="lp-og-match"
              type="checkbox"
              checked={draft.seo.ogMatchTheme}
              onChange={(e) => setSeo({ ogMatchTheme: e.target.checked })}
            />{" "}
            Match my theme
          </label>
          <p className="note lp-adv-note">
            On, your share card takes its colours from the site above. Off, you set them here — useful if your canvas is
            very dark and a link preview needs to stay readable on a white chat background.
          </p>
          {!draft.seo.ogMatchTheme && (
            <div className="lp-adv-fields">
              <ColourField id="ogAccent" label="Card accent" value={og.ogAccent} preset={theme.accent} overridden={!!draft.seo.ogAccent} onSet={(v) => setSeo({ ogAccent: v ?? "" })} />
              <ColourField id="ogBackground" label="Card background" value={og.ogBackground} preset={theme.bg} overridden={!!draft.seo.ogBackground} onSet={(v) => setSeo({ ogBackground: v ?? "" })} />
              <ColourField id="ogTextPrimary" label="Card heading" value={og.ogTextPrimary} preset={theme.text} overridden={!!draft.seo.ogTextPrimary} onSet={(v) => setSeo({ ogTextPrimary: v ?? "" })} />
              <ColourField id="ogTextSecondary" label="Card small text" value={og.ogTextSecondary} preset={theme.textMuted} overridden={!!draft.seo.ogTextSecondary} onSet={(v) => setSeo({ ogTextSecondary: v ?? "" })} />
            </div>
          )}
        </div>

        {Object.keys(ov).length > 0 && (
          <button type="button" className="secondary" onClick={() => setOv(RESET_ALL)}>
            Reset the colours and type to the preset
          </button>
        )}
      </div>
    </details>
  );
}

/// Contrast is checked against the COMPOSED theme rather than trusted to the presets, because the
/// presets are no longer the only thing producing these pairs. Warnings, not blocks: WCAG is not the
/// validator, and a creator who insists on a low-contrast brand is allowed to — after being told.
///
/// Rendered on step 2 itself. `textSubtle` is in the list because it is derived (from textMuted and
/// bg) and so has no control of its own to warn beside — nobody would ever go looking for it.
function ContrastWarnings({ theme }: { theme: LaunchpadTheme }) {
  const warnings: string[] = [];
  const check = (fg: string, bgc: string, what: string, min: number) => {
    const r = contrast(fg, bgc);
    if (r < min) warnings.push(`${what}: ${r.toFixed(1)}:1 — below the ${min}:1 minimum for readable text.`);
  };
  check(theme.text, theme.bg, "Body text on the background", 4.5);
  check(theme.ink, theme.accent, "Button labels on the accent", 4.5);
  check(theme.textMuted, theme.bg, "Muted text on the background", 3);
  check(theme.textSubtle, theme.bg, "Faint text (timestamps, counts) on the background", 3);

  if (warnings.length === 0) return null;
  return (
    <div className="lp-adv-warn" role="status">
      {warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
      <p>
        Not a blocker — you can carry on. Under Advanced, &ldquo;Text on buttons → Auto&rdquo; fixes the button pair in
        one click.
      </p>
    </div>
  );
}

/// Every key present and undefined, so `setOv` deletes all of them in one pass.
const RESET_ALL: Overrides = {
  bg: undefined,
  surface: undefined,
  text: undefined,
  textMuted: undefined,
  ink: undefined,
  up: undefined,
  down: undefined,
  hot: undefined,
  fontId: undefined,
  cornerId: undefined,
};

// ------------------------------------------------------------------------------------------------
//                                           CONTROLS
// ------------------------------------------------------------------------------------------------

/// A native picker plus a hex box — no library, and no route to a value the API would reject.
///
/// The text box is DELIBERATELY NARROWER than the zod `colour` grammar. The schema also accepts
/// #RGBA, #RRGGBBAA and rgb()/rgba(), but theme-presets.ts's parseHex understands only 3- and
/// 6-digit hex and fails open, so an 8-digit accent would silently collapse accentSoft from an 8%
/// wash to solid accent — accent text on an accent background, invisible, returned with a 200. And
/// Satori's own hex parser renders anything that is not 6-digit as fully transparent, which is how a
/// share card comes out blank. Six-digit hex is the one form every consumer downstream handles.
function ColourField({
  id,
  label,
  value,
  preset,
  overridden,
  onSet,
  extra,
}: {
  id: string;
  label: string;
  value: string;
  preset: string;
  overridden: boolean;
  onSet: (v: string | undefined) => void;
  extra?: React.ReactNode;
}) {
  const [text, setText] = useState(value);
  const [err, setErr] = useState<string | null>(null);

  // Follow the composed value whenever it changes from somewhere else: a preset switch, a reset, or
  // a background change that rebuilt this very token.
  useEffect(() => {
    setText(value);
    setErr(null);
  }, [value]);

  function commit(raw: string) {
    setText(raw);
    const v = raw.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(v)) {
      setErr("Use a 6-digit hex, like #1B7A4E");
      return;
    }
    // The authoritative gate is the schema the API itself runs — not a second regex that could drift.
    const parsed = colour.safeParse(v);
    if (!parsed.success) {
      setErr(parsed.error.issues[0].message);
      return;
    }
    setErr(null);
    onSet(parsed.data);
  }

  return (
    <div className="lp-adv-colour">
      <label htmlFor={`lp-c-${id}`}>{label}</label>
      <div className="lp-adv-colour-row">
        <input type="color" aria-label={`${label} colour picker`} value={asPickerHex(value, "#000000")} onChange={(e) => commit(e.target.value)} />
        <input
          id={`lp-c-${id}`}
          className={err ? "input-err" : ""}
          value={text}
          maxLength={9}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!err}
          aria-describedby={err ? `lp-c-${id}-err` : undefined}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => {
            // Leaving a half-typed hex behind would strand a red field forever; snap back to the
            // value the theme actually has.
            if (err) {
              setText(value);
              setErr(null);
            }
          }}
        />
        {extra}
        {overridden && (
          <button type="button" className="secondary lp-adv-mini" onClick={() => onSet(undefined)} title={`Back to ${preset}`}>
            Reset
          </button>
        )}
      </div>
      {err && (
        <span className="field-err" id={`lp-c-${id}-err`}>
          {err}
        </span>
      )}
    </div>
  );
}

/// A URL box validated with `safeUrl` — the same export the config schema composes — as the user
/// types. Empty is valid and means "no link": `safeUrl` rejects "", so an empty box has to become an
/// absent key rather than an empty string, which is what `omitBlank` does at build time.
function UrlField({
  id,
  label,
  value,
  placeholder,
  onSet,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onSet: (v: string) => void;
  describedBy?: string;
}) {
  const err = useMemo(() => {
    if (!value.trim()) return null;
    const r = safeUrl.safeParse(value);
    return r.success ? null : r.error.issues[0].message;
  }, [value]);

  return (
    <div className="lp-adv-colour">
      <label htmlFor={`lp-u-${id}`}>{label}</label>
      <input
        id={`lp-u-${id}`}
        type="url"
        inputMode="url"
        className={err ? "input-err" : ""}
        value={value}
        maxLength={500}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={!!err}
        aria-describedby={[err ? `lp-u-${id}-err` : null, describedBy].filter(Boolean).join(" ") || undefined}
        onChange={(e) => onSet(e.target.value)}
      />
      {err && (
        <span className="field-err" id={`lp-u-${id}-err`}>
          {err}
        </span>
      )}
    </div>
  );
}

/// An image field with exactly one way in — the upload route. There is no URL box on purpose: a
/// pasted third-party URL is a request every visitor's browser makes to a host the operator does not
/// control, and `safeUrl` cannot tell a CDN from a tracker.
function UploadField({
  id,
  label,
  hint,
  value,
  busy,
  onPick,
  onClear,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  busy: boolean;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="lp-adv-upload">
      <label htmlFor={`lp-up-${id}`}>{label}</label>
      <div className="lp-adv-upload-row">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="lp-adv-upload-thumb" />
        ) : (
          <span className="lp-adv-upload-thumb lp-adv-upload-ph" aria-hidden="true" />
        )}
        <input
          id={`lp-up-${id}`}
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        {value && (
          <button type="button" className="secondary lp-adv-mini" onClick={onClear}>
            Remove
          </button>
        )}
      </div>
      <p className="note lp-adv-note">{busy ? "Uploading…" : hint}</p>
    </div>
  );
}

/// A keyboard-reachable (i) tip: the button takes focus, and the bubble shows on both hover and
/// focus-within, so the detail is available without a mouse. Kept out of the layout so a field never
/// carries more than one line of help.
function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="lp-tip">
      <button type="button" className="lp-tip-btn" aria-label={label}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.7" r="0.95" fill="currentColor" />
          <path d="M8 7.2v4.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <span className="lp-tip-pop" role="tooltip">
        {children}
      </span>
    </span>
  );
}

function Steps({ step }: { step: Step }) {
  const labels = ["Brand", "Look", "Launch"];
  return (
    <ol className="lp-steps">
      {labels.map((l, i) => (
        <li key={l} className={i + 1 === step ? "active" : i + 1 < step ? "done" : ""}>
          <span className="lp-steps-n">{i + 1}</span>
          {l}
        </li>
      ))}
    </ol>
  );
}

function SlugStatus({ state, hosted }: { state: { status: string; reason?: string }; hosted: boolean }) {
  if (state.status === "idle") return null;
  if (state.status === "checking") return <span className="note">Checking…</span>;
  // "Available" is a claim about OUR registry. On a deployment with no registry it would be a claim
  // about nothing, so it is not made.
  if (state.status === "ok") return hosted ? <span className="ok">Available</span> : <span className="ok">Looks good</span>;
  return <span className="field-err">{state.reason}</span>;
}

// ------------------------------------------------------------------------------------------------
//                                   DERIVED SEO / CONFIG BUILD
// ------------------------------------------------------------------------------------------------

function brandOf(draft: Draft): string {
  return `${draft.name.trim()}${draft.tld}`;
}

function taglineOf(draft: Draft): string {
  return draft.tagline.trim() || DEFAULT_CONFIG.tagline;
}

function derivedTitle(draft: Draft): string {
  return `${brandOf(draft)} — ${taglineOf(draft)}`.slice(0, 120);
}

function derivedDescription(draft: Draft): string {
  return taglineOf(draft);
}

function derivedKeywords(draft: Draft): string[] {
  return ["meme coin launchpad", "bonding curve", draft.name.trim()].filter((k) => k.length > 0);
}

/// The four social-card colours. `seoSchema` requires all four, and Satori has no CSS custom
/// properties — so they are snapshotted from the COMPOSED theme rather than referenced, which is why
/// a creator who customised the canvas gets a card matching the site they built.
function ogColours(draft: Draft, theme: LaunchpadTheme) {
  const s = draft.seo;
  if (s.ogMatchTheme) {
    return { ogAccent: theme.accent, ogBackground: theme.bg, ogTextPrimary: theme.text, ogTextSecondary: theme.textMuted };
  }
  return {
    ogAccent: s.ogAccent || theme.accent,
    ogBackground: s.ogBackground || theme.bg,
    ogTextPrimary: s.ogTextPrimary || theme.text,
    ogTextSecondary: s.ogTextSecondary || theme.textMuted,
  };
}

/// A full config the API — or a self-hosted deployment's loader — will validate. `siteUrl` is the one
/// field that differs between the two paths: the hosted route pins it server-side, and the operator
/// types it because nothing here can know it.
function buildConfig(draft: Draft, theme: LaunchpadTheme, siteUrl: string) {
  const tagline = taglineOf(draft);
  // Each item is `text(48)` in seoSchema, so a single 49-character phrase used to fail the WHOLE
  // export with a zod path (`seo.keywords.0`) naming a field that does not exist on screen — the
  // control is two levels inside a collapsed <details> on the previous step. Capped here as well as
  // flagged in the control, so no keyword can ever make the export unreachable.
  const kw = draft.seo.keywords.trim()
    ? draft.seo.keywords
        .split(",")
        .map((k) => k.trim().slice(0, KEYWORD_MAX))
        .filter((k) => k.length > 0)
        .slice(0, 20)
    : derivedKeywords(draft);

  return {
    slug: draft.slug,
    // A single-tenant deployment serves every hostname it is given, so this list decides nothing
    // there; on the hosted path the server owns the domain table. Either way, empty is correct.
    domains: [],
    name: draft.name.trim(),
    tld: draft.tld,
    tagline,
    // NEVER DEFAULT_CONFIG's art. Those are "/pryntlogo-nobg.png" and "/koth-bg.jpg" — real files in
    // this repo, so a fork renders them for real: an operator who skipped an upload used to ship
    // prynt's brand mark next to their own wordmark. The logo is required by step 1, so this is the
    // operator's own file; the hero banner falls back to a neutral, brand-free gradient.
    logoUrl: draft.logoUrl,
    kothBgUrl: draft.kothBgUrl || NEUTRAL_KOTH_BG,
    // An omitted faviconUrl falls through to the shipped /icon.png, which is prynt's. The operator's
    // own mark is a better tab icon than somebody else's, so it is the default.
    faviconUrl: omitBlank(draft.faviconUrl) ?? omitBlank(draft.logoUrl),
    theme,
    seo: {
      title: draft.seo.title.trim() || derivedTitle(draft),
      description: draft.seo.description.trim() || derivedDescription(draft),
      siteUrl,
      // An empty keyword passes the schema (there is no per-item minimum) and ships as
      // `content="a,,b"`; filtered above rather than emitted as a malformed meta tag.
      keywords: kw,
      // Normalised again here, not only on blur: a creator who types into the handle box and then
      // hits Continue without the field ever losing focus would otherwise export a raw URL.
      twitterHandle: omitBlank(normalizeHandle(draft.seo.twitterHandle)),
      ...ogColours(draft, theme),
      ogTagline: (draft.seo.ogTagline.trim() || tagline).slice(0, 140),
    },
    links: draftLinks(draft),
    features: draftFeatures(draft),
  };
}

// ------------------------------------------------------------------------------------------------
//                                        STEP 3 — LAUNCH
// ------------------------------------------------------------------------------------------------
//
// One job: get to the claim. The creator connects a wallet, signs ONE free message that links the
// handle to that wallet, and lands on the deploy screen. The old step 3 handed over a raw config
// value and four blocks of export instructions; that machinery — the config textarea, the .env
// download, the DNS/address plumbing — moved to the dashboard and the self-hosting guide. Signing is
// free: it never touches the chain and costs no gas, and the copy says so rather than defending it.

function LaunchStep({
  draft,
  theme,
  hosted,
  hostedReady,
  submitting,
  setSubmitting,
  onDone,
  onBack,
}: {
  draft: Draft;
  theme: LaunchpadTheme;
  hosted: boolean;
  hostedReady: boolean;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onDone: (slug: string, url: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="lp-step">
      <h2>Launch</h2>
      <p className="lp-step-hint">
        Claim your handle, then put it live. Signing is free — it never touches the chain and costs no gas.
      </p>

      <ClaimPanel
        draft={draft}
        theme={theme}
        hosted={hosted}
        ready={hostedReady}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onDone={onDone}
      />

      <div className="lp-actions">
        <button className="secondary" onClick={onBack} disabled={submitting}>
          Back
        </button>
      </div>
    </section>
  );
}

/// The .env an operator downloads. Every NEXT_PUBLIC_* below is read from THIS deployment's own
/// build, so a self-hosted copy inherits the chain, contracts and indexer the generator is itself
/// pointed at rather than a hard-coded guess that goes stale on the next migration. Values that are
/// unset here are emitted commented-out with their meaning, never as an empty assignment that would
/// override a built-in default with "".
function envFile(envValue: string): string {
  const kv = (k: string, v: string | undefined, why: string) =>
    v ? `# ${why}\n${k}=${v}\n` : `# ${why}\n# ${k}=\n`;

  return (
    [
      "# Your launchpad. Generated — do not hand-edit the value below; regenerate it instead.",
      "# Paste these into your hosting provider's environment variables, then deploy.",
      "",
      "# ---- your design (brand, colours, type, copy). One value, all or nothing. ----",
      `${SINGLE_TENANT_ENV_VAR}=${envValue}`,
      "",
      "# Optional mirror of the SAME value. It is what puts YOUR name, description and accent on the",
      "# wallet-connect pop-up (that one runs in the browser and cannot read the value above).",
      "# Nothing else changes. If you set it, keep the two identical.",
      `# ${PUBLIC_MIRROR_ENV_VAR}=${envValue}`,
      "",
      "# ---- the two you have to go and get ----",
      "# REQUIRED. Stores coin images + descriptions. Free key at https://pinata.cloud",
      "# Uncomment this line and paste your key after the '=' sign.",
      "# PINATA_JWT=",
      "# Optional. Enables phone wallets. Free at https://cloud.reown.com",
      "# NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=",
      "",
      "# ---- the network. Already filled in; you should not need to touch these. ----",
    ].join("\n") +
    "\n" +
    kv("NEXT_PUBLIC_CHAIN_ID", process.env.NEXT_PUBLIC_CHAIN_ID, "Chain id.") +
    kv("NEXT_PUBLIC_CHAIN_NAME", process.env.NEXT_PUBLIC_CHAIN_NAME, "Chain name shown in wallets.") +
    kv("NEXT_PUBLIC_RPC_URL", process.env.NEXT_PUBLIC_RPC_URL, "Public RPC endpoint.") +
    kv("NEXT_PUBLIC_FACTORY_ADDRESS", process.env.NEXT_PUBLIC_FACTORY_ADDRESS, "The launchpad factory contract.") +
    kv("NEXT_PUBLIC_FEE_MANAGER_ADDRESS", process.env.NEXT_PUBLIC_FEE_MANAGER_ADDRESS, "Where creators claim their fees.") +
    kv("NEXT_PUBLIC_VIRTUAL_ETH_WEI", process.env.NEXT_PUBLIC_VIRTUAL_ETH_WEI, "Must match the deployed curve. Wrong value = wrong prices.") +
    kv("NEXT_PUBLIC_INDEXER_URL", process.env.NEXT_PUBLIC_INDEXER_URL, "The shared coin feed every launchpad reads.") +
    "\n# ---- your address, after you deploy ----\n" +
    "# Overrides the address baked into the config above. Set it once you know your real URL.\n" +
    "# NEXT_PUBLIC_SITE_URL=\n"
  );
}

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          },
          () => undefined,
        );
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/// A Blob + a synthetic anchor. No server round-trip, so the config never leaves the browser on this
/// path — which is the honest form of "nothing about it is stored here".
function DownloadButton({ filename, content, label }: { filename: string; content: string; label: string }) {
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoked on the next tick: revoking synchronously races the download in Safari.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }}
    >
      {label}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------
//                          THE HOSTED PATH — unchanged, still how prynt.fun works
// ------------------------------------------------------------------------------------------------

/// Connect wallet, then one signature that CLAIMS the handle to the wallet. The signature is not
/// "creating a hosted site" any more — it writes the row that says this name is yours, which is what
/// lets the deploy screen tick "Deployed" later and what a future on-chain registry resolves against.
/// The whole nonce -> sign -> verify -> create sequence is unchanged; only the framing is.
function ClaimPanel({
  draft,
  theme,
  ready,
  submitting,
  setSubmitting,
  onDone,
}: {
  draft: Draft;
  theme: LaunchpadTheme;
  hosted: boolean;
  ready: boolean;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onDone: (slug: string, url: string) => void;
}) {
  const toast = useToast();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();

  async function submit() {
    if (!address) return;
    setSubmitting(true);
    try {
      // siteUrl is set by the operator after they deploy (NEXT_PUBLIC_SITE_URL); the row's copy is
      // server-pinned regardless, so the platform default is the correct schema-valid placeholder.
      const config = buildConfig(draft, theme, DEFAULT_CONFIG.seo.siteUrl);

      // Validate against the API's own schema BEFORE asking for a signature — signing first and
      // handing back a 400 second is the worst ordering, and a bug this product already shipped once.
      const check = launchpadConfigSchema.safeParse({ ...config, ownerAddress: address });
      if (!check.success) {
        const i = check.error.issues[0];
        throw new Error(`${i.path.join(".")}: ${i.message}`);
      }

      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error((await nonceRes.json()).error ?? "Could not start sign-in");
      const { nonce, issuedAt } = (await nonceRes.json()) as { nonce: string; issuedAt: string };

      // Rebuilt exactly as the server rebuilds it; any drift and the signature will not verify.
      const domain = window.location.host;
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        "",
        "Sign in to manage your launchpads. This request will not trigger a transaction or cost any gas.",
        "",
        `URI: https://${domain}`,
        "Version: 1",
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
      ].join("\n");

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error ?? "Signature rejected");

      const createRes = await fetch("/api/launchpads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: draft.slug, config }),
      });
      const created = (await createRes.json()) as { slug?: string; url?: string; error?: string };
      if (!createRes.ok) throw new Error(created.error ?? "Could not claim the handle");

      onDone(created.slug!, created.url!);
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="lp-summary">
        <div>
          <span className="muted">Name</span>
          <strong>
            {draft.name}
            {draft.tld}
          </strong>
        </div>
        <div>
          <span className="muted">Handle</span>
          <strong>{draft.slug}</strong>
        </div>
        <div>
          <span className="muted">Wallet</span>
          <strong>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}</strong>
        </div>
      </div>

      {!ready && (
        <p className="field-err lp-adv-note" role="alert">
          That handle is taken. Go back and pick another — it is the one thing that has to be unique.
        </p>
      )}

      <div className="lp-actions">
        {!isConnected ? (
          <button onClick={() => connect({ connector: connectors[0] })}>Connect wallet</button>
        ) : (
          <button onClick={submit} disabled={submitting || !ready}>
            {submitting ? "Claiming…" : "Sign — claim your handle"}
          </button>
        )}
      </div>
    </>
  );
}

/// The end of the flow and the point of it: the launchpad is claimed, now the operator puts it live
/// on their own hosting. It is complete in BOTH deploy states — a real Deploy button when the public
/// template is published, an honest ordered checklist until then — and never renders a link that 404s.
function DeployScreen({ draft, theme, handle }: { draft: Draft; theme: LaunchpadTheme; handle: string }) {
  const envValue = useMemo(
    () => encodeLaunchpadConfig(buildConfig(draft, theme, DEFAULT_CONFIG.seo.siteUrl)),
    [draft, theme],
  );
  const name = draft.name || handle;

  return (
    <div className="lp-success">
      <div className="grad-badge">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </div>
      <h2>{name} is ready. Put it live.</h2>
      <p className="lp-success-sub">
        One click deploys your launchpad to your own Vercel — free hosting, your own domain, you own it fully.
      </p>

      {DEPLOY_READY ? (
        <>
          <a
            className="lp-deploy-btn"
            href={deployUrl(handle)}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => {
              // Copy the config on the way out so the paste target on Vercel's form is one box, not a
              // settings page to hunt for. Fire-and-forget: navigation must not wait on the clipboard.
              void navigator.clipboard?.writeText(envValue).catch(() => {});
            }}
          >
            <VercelMark />
            Deploy to Vercel
          </a>
          <p className="note lp-deploy-note">Takes about two minutes. No coding.</p>
        </>
      ) : (
        <p className="note lp-deploy-note">
          One-click deploy is switching on shortly. Until then the two steps below take a few minutes and land you in
          exactly the same place — your launchpad, on your own hosting.
        </p>
      )}

      <div className="lp-golive">
        <div className="lp-golive-step">
          <span className="lp-golive-n">1</span>
          <div>
            <strong>Your configuration</strong>
            <p className="note">Vercel asks for this during setup — copy it and paste it in.</p>
            <div className="lp-export-actions">
              <CopyButton text={envValue} label="Copy configuration" />
              <DownloadButton filename=".env.local" content={envFile(envValue)} label="Download .env" />
            </div>
          </div>
        </div>
        <div className="lp-golive-step">
          <span className="lp-golive-n">2</span>
          <div>
            <strong>A free Pinata key</strong>
            <p className="note">
              Stores the coin images people upload. Grab one free at{" "}
              <a href="https://pinata.cloud" target="_blank" rel="noreferrer noopener">
                pinata.cloud
              </a>{" "}
              — Vercel asks for it too.
            </p>
          </div>
        </div>
      </div>

      <DeployChecklist handle={handle} />

      <p className="note lp-success-foot">
        Prefer your own domain? Deploy first, then add it in your Vercel project and{" "}
        <a href="/dashboard">point it here</a>.
      </p>
    </div>
  );
}

/// Onboarding progress, the Shopify shape — but honest. An operator's deployment reads its config
/// from its own environment and never calls us, so there is no signal here we could truthfully
/// auto-detect; the audit's rule is that a checkbox which can never tick is worse than none. So the
/// first item is a MANUAL confirm (the operator ticks it once their Vercel build is up), remembered
/// across refreshes, and the rest are the next steps rather than fake auto-checkboxes.
function DeployChecklist({ handle }: { handle: string }) {
  const key = `prynt.deployed.${handle}`;
  const [deployed, setDeployed] = useState(false);
  useEffect(() => {
    try {
      setDeployed(window.localStorage.getItem(key) === "1");
    } catch {
      /* ignore */
    }
  }, [key]);

  const markDeployed = () => {
    setDeployed(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <ol className="lp-checklist" aria-label="Getting started">
      <li className={deployed ? "done" : "current"}>
        <span className="lp-check-mark" aria-hidden="true" />
        <span className="lp-check-body">
          <span>{deployed ? "Deployed" : "Deploy your launchpad"}</span>
          {!deployed && (
            <button type="button" className="lp-check-confirm" onClick={markDeployed}>
              Done it
            </button>
          )}
        </span>
      </li>
      <li className="next">
        <span className="lp-check-mark" aria-hidden="true" />
        <span className="lp-check-body">Launch your first coin</span>
      </li>
      <li className="next">
        <span className="lp-check-mark" aria-hidden="true" />
        <span className="lp-check-body">Add your own domain</span>
      </li>
    </ol>
  );
}

/// An X handle, not a URL. `text(32)` accepts a full profile URL happily, and layout.tsx pipes this
/// straight into `twitter:site` where a URL renders as broken text — the schema will not save you,
/// so the control normalises.
function normalizeHandle(raw: string): string {
  const v = stripAngles(raw).trim();
  if (!v) return "";
  const m = v.match(/(?:x\.com|twitter\.com)\/@?([A-Za-z0-9_]{1,15})/i);
  const handle = m ? m[1] : v.replace(/^@+/, "");
  return `@${handle.replace(/[^A-Za-z0-9_]/g, "")}`.slice(0, 32);
}

function VercelMark() {
  return (
    <svg viewBox="0 0 76 65" width="15" height="13" aria-hidden="true" focusable="false">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
    </svg>
  );
}
