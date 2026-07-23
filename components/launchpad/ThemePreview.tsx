"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONFIG, type LaunchpadFeatures, type LaunchpadLinks, type LaunchpadTheme } from "@/lib/launchpad-config";
import type { TokenSummary } from "@/lib/api";
import { TokenCard } from "@/components/board/TokenCard";
import { PreviewStage } from "@/app/launchpad-preview/PreviewStage";
import { themeToStyleObject } from "@/app/launchpad-preview/theme-style";
import {
  newPreviewId,
  onPreviewMessage,
  publishDraft,
  retireDraft,
  PREVIEW_ROUTE,
  type PreviewDraftInput,
} from "@/app/launchpad-preview/handoff";
import s from "@/app/launchpad-preview/preview-stage.module.css";

// Live preview for the creator. Renders the REAL TokenCard against mock coins inside a container
// whose CSS custom properties are overridden — so what the user sees is the actual card component
// with the actual stylesheet, not a drawing of one. If a preset breaks card contrast, it breaks
// here too, which is the point.
//
// The variable map is imported rather than re-listed: a token added to the theme must not need a
// second edit here to show up in the preview.

type MockSpec = { name: string; symbol: string; mcap: string; progress: number; age: number; seed: string };

const SPECS: MockSpec[] = [
  { name: "Pepe Supreme", symbol: "PEPE", mcap: "3.42", progress: 68, age: 3600, seed: "a" },
  { name: "Moon Doge", symbol: "MDOGE", mcap: "1.87", progress: 24, age: 18_000, seed: "b" },
  { name: "Based Cat", symbol: "BCAT", mcap: "8.05", progress: 91, age: 86_400, seed: "c" },
  { name: "Night Owl", symbol: "OWL", mcap: "0.94", progress: 7, age: 300, seed: "d" },
];

/// HYDRATION. TokenCard renders `timeAgo(t.createdAt)` against a live `Date.now()`, so any mock
/// timestamp derived from wall-clock time at module evaluation differs between the server module
/// instance and the client bundle — the two are evaluated minutes or hours apart — and React threw
/// "server rendered text didn't match the client" on every single load of /create-launchpad, then
/// regenerated the whole preview tree.
///
/// So the reference time is a CONSTANT for the server render and the first client render (they must
/// agree byte for byte), and the real clock is only picked up after mount. The constant is in the
/// far future on purpose: `timeAgo` clamps a negative age to zero, so the pre-hydration paint reads
/// a uniform "0s" — brand-new coins, which is plausible on a launchpad — rather than a wrong number
/// that would grow more wrong the longer the server process lives.
const SSR_EPOCH = 4_102_444_800; // 2100-01-01T00:00:00Z

function mocks(now: number): TokenSummary[] {
  return SPECS.map((s) => mock(s, now));
}

const SSR_MOCK = mocks(SSR_EPOCH);

/// What CreateLaunchpadWizard hard-codes into the config it submits. Used only when a caller does
/// not pass `features`, so the full-page preview shows the flags the created launchpad will have
/// rather than DEFAULT_CONFIG's (which has showWhitepaper: true and would draw a nav item the new
/// launchpad does not get).
const WIZARD_DEFAULT_FEATURES: LaunchpadFeatures = {
  showKingOfHill: true,
  showLeaderboard: true,
  showWhitepaper: false,
  networkFeed: true,
};

function mock(o: MockSpec, now: number): TokenSummary {
  return {
    curve: `0x${o.seed.repeat(40).slice(0, 40)}`,
    token: `0x${o.seed.repeat(40).slice(0, 40)}`,
    creator: `0x${o.seed.repeat(40).slice(0, 40)}`,
    name: o.name,
    symbol: o.symbol,
    metadataURI: "",
    createdAt: String(now - o.age),
    metadataResolved: true,
    nsfw: false,
    imageUrl: null, // forces TokenImage's gradient monogram — no network in a preview
    description: null,
    website: null,
    twitter: null,
    telegram: null,
    lastPriceWei: "0",
    marketCapWei: "0",
    volumeEthWei: "0",
    realEthReserve: "0",
    realTokenReserve: "0",
    tradeCount: 12,
    holderCount: 5,
    lastTradeAt: String(now - 60),
    bondingProgress: o.progress / 100,
    complete: false,
    migrated: false,
    priceEth: "0",
    marketCapEth: o.mcap,
    volumeEth: "0",
    bondingProgressPct: o.progress,
    readyToGraduate: false,
  };
}

export function ThemePreview({
  theme,
  name,
  tld,
  logoUrl,
  tagline,
  kothBgUrl,
  features,
  links,
  slug,
  fullPage = true,
}: {
  theme: LaunchpadTheme;
  name: string;
  tld: string;
  logoUrl?: string;
  // ── Optional, and optional on purpose ──────────────────────────────────────────────────────────
  // The wizard and the dashboard are owned by other workstreams; they render this panel with four
  // props today. Everything the FULL-PAGE stage additionally needs falls back to DEFAULT_CONFIG, so
  // this file can ship without touching theirs. Passing the real values makes the full-page view
  // more faithful (the tagline in the brand, the tenant's KotH art, the whitepaper nav item) — see
  // the report for the two-line change on each side.
  tagline?: string;
  kothBgUrl?: string;
  features?: LaunchpadFeatures;
  links?: LaunchpadLinks;
  slug?: string;
  /// Set false to render the bare panel with no escalation control.
  fullPage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // The draft as the preview side will receive it. Deliberately NOT validated here: validation is
  // the receiving side's job (see app/launchpad-preview/handoff.ts), because on the new-tab path
  // the value crosses localStorage and this component's word for it is worth nothing there.
  const draft: PreviewDraftInput = useMemo(
    () => ({
      v: 1,
      slug,
      name: name || "your",
      // "" means the creator has not chosen a suffix — draw nothing rather than invent ".fun".
      tld,
      // NOT DEFAULT_CONFIG.tagline / .features. Those are prynt's copy and prynt's flags, and a
      // preview that fills an operator's blanks with the platform's brand is the exact failure this
      // whole workstream exists to remove. Blank tagline stays blank; the flags fall back to the
      // same set the wizard itself submits, so the preview and the created launchpad agree.
      tagline: tagline ?? "",
      // The two URL fallbacks are different in kind: globals.css already resolves
      // var(--logo-url, url(/pryntlogo-nobg.png)) and var(--koth-bg-url, url(/koth-bg.jpg)), so
      // omitting them shows the shipped art either way. Passing the default explicitly keeps the
      // preview identical to what a deployment with no logo would actually render.
      logoUrl: logoUrl || DEFAULT_CONFIG.logoUrl,
      kothBgUrl: kothBgUrl || DEFAULT_CONFIG.kothBgUrl,
      theme,
      features: features ?? WIZARD_DEFAULT_FEATURES,
      links: links ?? {},
    }),
    [slug, name, tld, tagline, logoUrl, kothBgUrl, theme, features, links],
  );

  // ── new-tab handoff ────────────────────────────────────────────────────────────────────────────
  const [tabId, setTabId] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const openTab = useCallback(() => {
    const id = newPreviewId();
    publishDraft(id, draftRef.current);
    setTabId(id);
    window.open(`${PREVIEW_ROUTE}#${id}`, "_blank", "noopener");
  }, []);

  // Stream every edit to the open tab, and answer its "hello" after a reload.
  useEffect(() => {
    if (!tabId) return;
    publishDraft(tabId, draft);
  }, [tabId, draft]);

  useEffect(() => {
    if (!tabId) return;
    return onPreviewMessage(tabId, (m) => {
      if (m.type === "hello") publishDraft(tabId, draftRef.current);
    });
  }, [tabId]);

  // Cleanup: the key must not outlive the editor. Both on unmount and on pagehide, because a tab
  // closed outright never unmounts.
  useEffect(() => {
    if (!tabId) return;
    const bye = () => retireDraft(tabId);
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, [tabId]);

  return (
    <>
      {fullPage && (
        <div className={s.triggers}>
          <button type="button" onClick={() => setOpen(true)}>
            See it full-page
          </button>
          <button type="button" className="secondary" onClick={openTab}>
            Open in new tab
          </button>
        </div>
      )}
      {open && <PreviewStage draft={draft} onExit={close} mode="overlay" />}
      <ThemePanel theme={theme} name={name} tld={tld} logoUrl={logoUrl} />
    </>
  );
}

/// The at-a-glance panel — unchanged. It stays the always-visible companion while editing, and it
/// is the graceful fallback when the indexer is down (the full-page stage renders the real board,
/// which shows the real error state).
function ThemePanel({
  theme,
  name,
  tld,
  logoUrl,
}: {
  theme: LaunchpadTheme;
  name: string;
  tld: string;
  logoUrl?: string;
}) {
  // See SSR_EPOCH: constant on the server and on the first client render, real clock after mount.
  const [rows, setRows] = useState<TokenSummary[]>(SSR_MOCK);
  useEffect(() => setRows(mocks(Math.floor(Date.now() / 1000))), []);

  return (
    <div className="lp-preview" style={themeToStyleObject(theme)} aria-label="Live preview">
      <div className="lp-preview-chrome">
        <div className="lp-preview-brand">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="lp-preview-logo" />
          ) : (
            <span className="lp-preview-logo lp-preview-logo-ph" />
          )}
          <span className="brand">
            <span className="logo-name">{name || "your"}</span>
            {/* No ".fun" fallback: an empty suffix must draw an empty suffix. */}
            <span className="logo-tld">{tld}</span>
          </span>
        </div>
        <span className="lp-preview-cta">Create coin</span>
      </div>

      <div className="lp-preview-body">
        <div className="lp-preview-pills">
          <span className="pill active">New</span>
          <span className="pill">Market cap</span>
          <span className="pill">Volume</span>
        </div>
        {/* pointer-events are killed in CSS: the cards are real Links and must not navigate.
            ethUsd is passed deliberately — without it TokenCard falls back to compactEth, which
            formats via toLocaleString() and so renders "3,42" on a server with a comma locale but
            "3.42" in the browser, tripping a hydration mismatch. The real board always has a price,
            so supplying one here is also the faithful thing to do. */}
        <div className="board-grid lp-preview-grid">
          {rows.map((t) => (
            <TokenCard key={t.curve} t={t} ethUsd={2500} />
          ))}
        </div>
      </div>
    </div>
  );
}
