"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import type { LaunchpadConfig, LaunchpadSeo, LaunchpadTheme } from "@/lib/launchpad-config";
import { colour, safeUrl } from "@/lib/launchpad-schema";
import { THEME_PRESETS, accentFamily } from "@/lib/theme-presets";
import type { PreviewDraftInput } from "@/app/launchpad-preview/handoff";
import { PreviewStage } from "@/app/launchpad-preview/PreviewStage";
import { ThemePreview } from "./ThemePreview";
import { useToast } from "@/lib/toast";

// Owner panel. Everything here is gated on the session cookie minted by a wallet signature; the
// server re-checks ownership on every mutation, so this UI is convenience, not security.
//
// EDITING MODEL. The editor holds the STORED config and patches individual fields. It deliberately
// does NOT rebuild the theme from `themeFromPreset(presetId, accent)` on save, which is what the
// previous version did: that threw away every per-token override on the next unrelated edit (a
// tagline change could reset a dark tenant to white, because the preset was recovered from `bg` +
// `text` with a `clean-light` fallback). Applying a preset is now an explicit, announced action.

type DomainRow = {
  id: string;
  domain: string;
  verified: boolean;
  verificationToken: string;
};

type Item = {
  id: string;
  slug: string;
  status: string;
  config: LaunchpadConfig;
  domains: DomainRow[];
};

type Tab = "brand" | "theme" | "seo" | "domains" | "stats";

const EDITOR_TABS: Tab[] = ["brand", "theme", "seo"];

export function Dashboard({ apex }: { apex: string }) {
  const toast = useToast();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [items, setItems] = useState<Item[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("brand");

  const load = useCallback(async () => {
    const res = await fetch("/api/launchpads/mine");
    if (res.status === 401) {
      setAuthed(false);
      setItems(null);
      return;
    }
    const j = (await res.json()) as { launchpads: Item[] };
    setAuthed(true);
    setItems(j.launchpads);
    setActive((cur) => cur ?? j.launchpads[0]?.slug ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signIn() {
    if (!address) return;
    try {
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error((await nonceRes.json()).error ?? "Could not start sign-in");
      const { nonce, issuedAt } = (await nonceRes.json()) as { nonce: string; issuedAt: string };
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
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Signature rejected");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Sign-in failed");
    }
  }

  if (authed === null) return <p className="note">Loading…</p>;

  if (!authed) {
    return (
      <div className="lp-signin">
        <h2>Sign in</h2>
        <p className="lp-step-hint">Your wallet is your account. Signing is free and costs no gas.</p>
        {!isConnected ? (
          <button onClick={() => connect({ connector: connectors[0] })}>Connect wallet</button>
        ) : (
          <button onClick={signIn}>Sign in as {address?.slice(0, 6)}…{address?.slice(-4)}</button>
        )}
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="lp-signin">
        <h2>No launchpads yet</h2>
        <p className="lp-step-hint">This wallet does not own one.</p>
        <a className="hiw-cta-primary" href="/create-launchpad">
          Create your launchpad
        </a>
      </div>
    );
  }

  const current = items.find((i) => i.slug === active) ?? items[0];

  return (
    <div className="lp-dash">
      <aside className="lp-dash-list">
        {items.map((i) => (
          <button
            key={i.slug}
            className={`lp-dash-item${i.slug === current.slug ? " active" : ""}`}
            onClick={() => setActive(i.slug)}
          >
            <strong>
              {i.config.name}
              {i.config.tld}
            </strong>
            {/* No apex configured means launchpads get no hostname of their own here; printing
                "<slug>." (or the old "<slug>.localhost:3000") would be an address that resolves
                nowhere. Show the handle alone instead. */}
            <small>{apex ? `${i.slug}.${apex}` : i.slug}</small>
          </button>
        ))}
        <a className="lp-dash-new" href="/create-launchpad">
          + New launchpad
        </a>
      </aside>

      <div className="lp-dash-main">
        <nav className="activity-tabs">
          <button className={tab === "brand" ? "active" : ""} onClick={() => setTab("brand")}>
            Brand
          </button>
          <button className={tab === "theme" ? "active" : ""} onClick={() => setTab("theme")}>
            Theme
          </button>
          <button className={tab === "seo" ? "active" : ""} onClick={() => setTab("seo")}>
            SEO &amp; social
          </button>
          <button className={tab === "domains" ? "active" : ""} onClick={() => setTab("domains")}>
            Domains
          </button>
          <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
            Stats
          </button>
        </nav>

        {/* One editor instance across the three config tabs, so switching tabs never drops an edit.
            `key` re-seeds it when the owner selects a different launchpad. */}
        {EDITOR_TABS.includes(tab) && (
          <ConfigEditor
            key={current.slug}
            item={current}
            apex={apex}
            panel={tab as "brand" | "theme" | "seo"}
            onSaved={load}
          />
        )}
        {tab === "domains" && <DomainsTab item={current} apex={apex} onChanged={load} />}
        {tab === "stats" && <StatsTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//                                       SHARED CONTROLS
// ---------------------------------------------------------------------------------------------

/// The server strips `<` and `>` from every display-text field rather than rejecting them
/// (launchpad-schema.ts `text()`), so a user who types one would otherwise see their value change
/// silently after save. Stripping on input keeps the field honest about what will be stored.
function stripAngles(v: string): string {
  return v.replace(/[<>]/g, "");
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

function TextField({
  id,
  label,
  hint,
  value,
  max,
  onChange,
  placeholder,
  multiline,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const over = value.length > max;
  return (
    <div className="lp-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="lp-field-hint">{hint}</p>}
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={3}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(stripAngles(e.target.value))}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(stripAngles(e.target.value))}
        />
      )}
      <div className="lp-field-foot">
        <span className={over ? "field-err" : "note"}>
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}

/// http(s) URL or a same-origin path, validated with the SAME `safeUrl` schema the API uses, so the
/// field can never accept something the server would 400 on. `data:` and `javascript:` are rejected
/// here for the same reason they are rejected there.
function UrlField({
  id,
  label,
  hint,
  value,
  onChange,
  optional,
  onUpload,
  uploading,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  onUpload?: (f: File) => void;
  uploading?: boolean;
}) {
  const empty = value.trim() === "";
  const err = empty ? (optional ? null : "Required") : urlError(value);
  return (
    <div className="lp-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="lp-field-hint">{hint}</p>}
      <div className="lp-url-row">
        <input id={id} value={value} placeholder="https://… or /path" onChange={(e) => onChange(e.target.value)} />
        {onUpload && (
          <label className="lp-upload">
            {uploading ? "…" : "Upload"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </label>
        )}
      </div>
      {err && <span className="field-err">{err}</span>}
    </div>
  );
}

function urlError(v: string): string | null {
  const r = safeUrl.safeParse(v);
  return r.success ? null : (r.error.issues[0]?.message ?? "Invalid URL");
}

/// `<input type="color">` plus a hex field. The text half is validated against a NARROWER grammar
/// than the zod `colour` schema on purpose when `strict` is set:
///
///   the schema accepts `#RRGGBBAA`, `#RGBA` and `rgb()`, but `parseHex` in theme-presets.ts only
///   understands 3- and 6-digit hex and FAILS OPEN — an 8-digit accent would collapse the whole
///   derived accent family to one solid colour (accent-on-accent text, HTTP 200), and Satori's own
///   `hexToRgba` in app/opengraph-image.tsx degrades anything else to fully transparent.
///
/// So every colour that is fed into a derivation (accent) or into the OG renderer is strict 6-hex;
/// the advanced chrome tokens, which are stored verbatim and are rgba() in the shipped presets, use
/// the full schema grammar.
function ColourField({
  id,
  label,
  hint,
  value,
  onChange,
  strict = true,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  strict?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const valid = strict ? HEX6.test(text.trim()) : colour.safeParse(text).success;

  function commit(v: string) {
    setText(v);
    if (strict ? HEX6.test(v.trim()) : colour.safeParse(v).success) onChange(v.trim());
  }

  return (
    <div className="lp-field lp-colour-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="lp-field-hint">{hint}</p>}
      <div className="lp-accent-row">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={HEX6.test(value) ? value : "#000000"}
          disabled={disabled}
          onChange={(e) => commit(e.target.value.toUpperCase())}
        />
        <input
          id={id}
          className={valid ? "" : "input-err"}
          value={text}
          maxLength={64}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => commit(e.target.value)}
        />
      </div>
      {!valid && (
        <span className="field-err">
          {strict ? "Use a 6-digit hex colour, e.g. #1B7A4E" : "Must be a hex colour or rgb()/rgba()"}
        </span>
      )}
    </div>
  );
}

function Switch({ label, on, onToggle, hint }: { label: string; on: boolean; onToggle: () => void; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="grad-toggle" onClick={onToggle} title={hint}>
      <span className="grad-toggle-label">{label}</span>
      <span className={`ui-switch${on ? " on" : ""}`}>
        <span className="ui-switch-knob" />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
//                                       THEME DERIVATION
// ---------------------------------------------------------------------------------------------

/// Radii come from three named shapes rather than six free sliders. `cssLength` requires a unit, so
/// a slider at 0 would emit "0" and 400; a closed set can only emit valid lengths.
const CORNERS: Record<string, Pick<LaunchpadTheme, "radiusXs" | "radiusSm" | "radiusMd" | "radiusLg" | "radiusCard" | "radiusPill">> = {
  sharp: { radiusXs: "2px", radiusSm: "2px", radiusMd: "2px", radiusLg: "4px", radiusCard: "2px", radiusPill: "4px" },
  soft: { radiusXs: "8px", radiusSm: "12px", radiusMd: "12px", radiusLg: "18px", radiusCard: "14px", radiusPill: "999px" },
  round: { radiusXs: "10px", radiusSm: "14px", radiusMd: "16px", radiusLg: "24px", radiusCard: "20px", radiusPill: "999px" },
};

function cornerOf(t: LaunchpadTheme): string {
  const hit = Object.entries(CORNERS).find(([, r]) => r.radiusCard === t.radiusCard && r.radiusLg === t.radiusLg);
  return hit?.[0] ?? "custom";
}

/// A closed list, never a free text field: `fontStack` rejects "(" outright, which kills url(),
/// local() and format() — so a "paste a Google Fonts URL" control is impossible by design. These
/// stacks are locally-available families plus generic fallbacks, so a launchpad still renders with
/// no network font fetch.
const FONT_STACKS: { id: string; label: string; value: string }[] = [
  {
    id: "satoshi",
    label: "Satoshi / system (default)",
    value: "'Satoshi', -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Inter, system-ui, sans-serif",
  },
  {
    id: "system",
    label: "System native",
    value: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, system-ui, sans-serif",
  },
  { id: "inter", label: "Inter", value: "Inter, system-ui, -apple-system, \"Segoe UI\", sans-serif" },
  { id: "grotesk", label: "Grotesk", value: "\"Trebuchet MS\", \"Helvetica Neue\", Helvetica, Arial, sans-serif" },
  { id: "serif", label: "Serif", value: "Georgia, \"Times New Roman\", Times, serif" },
  { id: "mono", label: "Monospace", value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
];

// ---------------------------------------------------------------------------------------------
//                                          THE EDITOR
// ---------------------------------------------------------------------------------------------

type Draft = {
  name: string;
  tld: string;
  tagline: string;
  logoUrl: string;
  kothBgUrl: string;
  faviconUrl: string;
  theme: LaunchpadTheme;
  seo: LaunchpadSeo;
  keywordsText: string;
  links: LaunchpadConfig["links"];
  features: LaunchpadConfig["features"];
  ogLinked: boolean;
};

function seedDraft(cfg: LaunchpadConfig): Draft {
  return {
    name: cfg.name,
    tld: cfg.tld,
    tagline: cfg.tagline,
    logoUrl: cfg.logoUrl,
    kothBgUrl: cfg.kothBgUrl,
    faviconUrl: cfg.faviconUrl ?? "",
    theme: { ...cfg.theme },
    seo: { ...cfg.seo },
    keywordsText: (cfg.seo.keywords ?? []).join(", "),
    links: { ...cfg.links },
    features: { ...cfg.features },
    // "Match my theme" starts on only when the stored card actually still matches the site, so an
    // owner who deliberately unlinked their card does not get it silently relinked.
    ogLinked:
      cfg.seo.ogAccent === cfg.theme.accent &&
      cfg.seo.ogBackground === cfg.theme.bg &&
      cfg.seo.ogTextPrimary === cfg.theme.text &&
      cfg.seo.ogTextSecondary === cfg.theme.textMuted,
  };
}

/// The OG colours the card will actually be rendered with, given the link switch.
function effectiveOg(d: Draft): Pick<LaunchpadSeo, "ogAccent" | "ogBackground" | "ogTextPrimary" | "ogTextSecondary"> {
  if (!d.ogLinked) {
    return {
      ogAccent: d.seo.ogAccent,
      ogBackground: d.seo.ogBackground,
      ogTextPrimary: d.seo.ogTextPrimary,
      ogTextSecondary: d.seo.ogTextSecondary,
    };
  }
  return {
    ogAccent: d.theme.accent,
    ogBackground: d.theme.bg,
    ogTextPrimary: d.theme.text,
    ogTextSecondary: d.theme.textMuted,
  };
}

function buildPatch(d: Draft) {
  const keywords = d.keywordsText
    .split(",")
    .map((k) => stripAngles(k).trim())
    .filter(Boolean)
    .slice(0, 20);
  // A CLEARED box has to travel as an explicit `null`, not as an absent key. The PATCH route merges
  // links shallowly over the stored ones, so dropping the key meant "leave it as it was": clearing
  // the X link saved successfully and the footer link stayed live, with no way to ever remove it.
  // `null` is the delete instruction; the route strips those keys before the schema sees them
  // (`safeUrl` rejects both "" and null). `defillama` is untouched here and survives the merge.
  const trimmedLinks = Object.fromEntries(
    (["twitter", "telegram", "docs"] as const).map((k) => [k, (d.links[k] ?? "").trim() || null]),
  );
  return {
    name: d.name.trim(),
    tld: d.tld.trim(),
    tagline: d.tagline.trim(),
    logoUrl: d.logoUrl.trim(),
    kothBgUrl: d.kothBgUrl.trim(),
    // Optional in the schema: an empty string is not a valid safeUrl, so drop the key entirely.
    ...(d.faviconUrl.trim() ? { faviconUrl: d.faviconUrl.trim() } : {}),
    theme: d.theme,
    seo: {
      ...d.seo,
      ...effectiveOg(d),
      keywords,
      // siteUrl is server-pinned on PATCH; sending it changes nothing, so it is left out rather
      // than pretending this control surface owns it.
      siteUrl: undefined,
    },
    links: trimmedLinks,
    features: d.features,
  };
}

function ConfigEditor({
  item,
  apex,
  panel,
  onSaved,
}: {
  item: Item;
  apex: string;
  panel: "brand" | "theme" | "seo";
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => seedDraft(item.config));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const baseline = useRef(JSON.stringify(buildPatch(seedDraft(item.config))));

  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const setTheme = useCallback(
    (patch: Partial<LaunchpadTheme>) => setDraft((d) => ({ ...d, theme: { ...d.theme, ...patch } })),
    [],
  );
  const setSeo = useCallback(
    (patch: Partial<LaunchpadSeo>) => setDraft((d) => ({ ...d, seo: { ...d.seo, ...patch } })),
    [],
  );

  const patch = useMemo(() => buildPatch(draft), [draft]);
  const dirty = JSON.stringify(patch) !== baseline.current;

  async function upload(kind: "logoUrl" | "kothBgUrl" | "faviconUrl", file: File) {
    setUploading(kind);
    try {
      const fd = new FormData();
      // "image", not "file": that is the field app/api/upload/route.ts reads. With "file" the route
      // pinned an empty metadata JSON and returned imageUrl "", so every dashboard image upload
      // failed with "Upload failed: upload failed".
      fd.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok || !j.imageUrl) throw new Error(j.error ?? "upload failed");
      set({ [kind]: j.imageUrl } as Partial<Draft>);
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const body = buildPatch(draft);
      const res = await fetch(`/api/launchpads/${item.slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string; issues?: { path: string; message: string }[] };
      if (!res.ok) {
        const detail = j.issues?.map((i) => `${i.path}: ${i.message}`).join("; ");
        throw new Error(detail || j.error || "Could not save");
      }
      baseline.current = JSON.stringify(body);
      toast.success("Saved — live within a minute");
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /// Full-page preview of the UNSAVED draft. Same tab, so there is exactly one copy of the state
  /// and the stage cannot desync from the form. The stage re-validates everything it is handed —
  /// this side just has to hand over the shape the handoff schema declares.
  const previewDraft: PreviewDraftInput = {
    v: 1,
    slug: item.slug,
    name: draft.name,
    tld: draft.tld,
    tagline: draft.tagline,
    logoUrl: draft.logoUrl,
    kothBgUrl: draft.kothBgUrl,
    theme: draft.theme,
    features: draft.features,
    links: patch.links,
  };

  return (
    <div className="lp-dash-grid">
      <section className="lp-step">
        {panel === "brand" && (
          <BrandPanel draft={draft} set={set} uploading={uploading} upload={upload} />
        )}
        {panel === "theme" && <ThemePanel draft={draft} set={set} setTheme={setTheme} />}
        {panel === "seo" && <SeoPanel draft={draft} set={set} setSeo={setSeo} siteUrl={item.config.seo.siteUrl} />}

        <div className="lp-actions lp-save-bar">
          <button onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <button type="button" className="secondary" onClick={() => setPreviewOpen(true)}>
            Full-page preview
          </button>
          <a className="hiw-cta-secondary" href={apex ? `https://${item.slug}.${apex}` : `/?tenant=${item.slug}`}>
            Visit
          </a>
          {dirty && <span className="note">Unsaved changes</span>}
        </div>
      </section>

      <aside className="lp-wizard-preview">
        <div className="lp-preview-label">Live preview</div>
        <ThemePreview theme={draft.theme} name={draft.name} tld={draft.tld} logoUrl={draft.logoUrl} />
        {panel === "seo" && (
          <>
            <div className="lp-preview-label" style={{ marginTop: 18 }}>
              Social card
            </div>
            <OgCardPreview draft={draft} />
          </>
        )}
      </aside>

      {previewOpen && (
        <PreviewStage draft={previewDraft} mode="overlay" onExit={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//                                            BRAND
// ---------------------------------------------------------------------------------------------

function BrandPanel({
  draft,
  set,
  uploading,
  upload,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  uploading: string | null;
  upload: (kind: "logoUrl" | "kothBgUrl" | "faviconUrl", f: File) => void;
}) {
  return (
    <>
      <h2>Brand</h2>
      <p className="lp-step-hint">Identity, not taste. This is what a trader reads before they read anything else.</p>

      <TextField id="d-name" label="Name" value={draft.name} max={32} onChange={(v) => set({ name: v })} />

      <TextField
        id="d-tld"
        label="Suffix"
        hint="Rendered after the name in your sidebar, page titles and social card. Leave it blank unless you actually own that domain — it is a claim, not decoration."
        value={draft.tld}
        max={16}
        placeholder=".fun"
        onChange={(v) => set({ tld: v })}
      />

      <TextField id="d-tagline" label="Tagline" value={draft.tagline} max={140} onChange={(v) => set({ tagline: v })} />

      <UrlField
        id="d-logo"
        label="Logo"
        hint="Square PNG or SVG. Shown in the sidebar."
        value={draft.logoUrl}
        onChange={(v) => set({ logoUrl: v })}
        onUpload={(f) => upload("logoUrl", f)}
        uploading={uploading === "logoUrl"}
      />

      <UrlField
        id="d-koth"
        label="King of the Hill background"
        hint="The photo behind the hero band at the top of your board. Wide, dark images work best."
        value={draft.kothBgUrl}
        onChange={(v) => set({ kothBgUrl: v })}
        onUpload={(f) => upload("kothBgUrl", f)}
        uploading={uploading === "kothBgUrl"}
      />

      <UrlField
        id="d-favicon"
        label="Favicon"
        hint="Optional. The icon in the browser tab — without it your tab shows the platform's mark."
        value={draft.faviconUrl}
        optional
        onChange={(v) => set({ faviconUrl: v })}
        onUpload={(f) => upload("faviconUrl", f)}
        uploading={uploading === "faviconUrl"}
      />

      <div className="lp-field">
        <label htmlFor="d-link-twitter">Links</label>
        <p className="lp-field-hint">Shown in your footer. Leave blank to hide.</p>
        {(["twitter", "telegram", "docs"] as const).map((k) => {
          const v = draft.links[k] ?? "";
          const err = v.trim() ? urlError(v) : null;
          return (
            <div key={k} className="lp-link-row">
              <input
                id={`d-link-${k}`}
                aria-label={`${k} URL`}
                placeholder={`${k} URL`}
                value={v}
                className={err ? "input-err" : ""}
                onChange={(e) => set({ links: { ...draft.links, [k]: e.target.value || undefined } })}
              />
              {err && <span className="field-err">{err}</span>}
            </div>
          );
        })}
      </div>

      <div className="lp-field">
        <label>Sections</label>
        <p className="lp-field-hint">
          Only <strong>Whitepaper</strong> is read by the site today. The other three are stored and validated but no
          board component reads them yet — they will start taking effect without you touching anything.
        </p>
        <div className="lp-flags">
          <Switch
            label="Whitepaper"
            on={draft.features.showWhitepaper}
            onToggle={() => set({ features: { ...draft.features, showWhitepaper: !draft.features.showWhitepaper } })}
          />
          <Switch
            label="King of the Hill (not wired yet)"
            on={draft.features.showKingOfHill}
            onToggle={() => set({ features: { ...draft.features, showKingOfHill: !draft.features.showKingOfHill } })}
          />
          <Switch
            label="Leaderboard (not wired yet)"
            on={draft.features.showLeaderboard}
            onToggle={() => set({ features: { ...draft.features, showLeaderboard: !draft.features.showLeaderboard } })}
          />
          <Switch
            label="Network feed (not wired yet)"
            on={draft.features.networkFeed}
            onToggle={() => set({ features: { ...draft.features, networkFeed: !draft.features.networkFeed } })}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//                                            THEME
// ---------------------------------------------------------------------------------------------

const ADVANCED_TOKENS: { field: keyof LaunchpadTheme; label: string }[] = [
  { field: "surface2", label: "Surface 2 (raised panels)" },
  { field: "border", label: "Border" },
  { field: "borderSoft", label: "Border (soft)" },
  { field: "textSubtle", label: "Text subtle" },
  { field: "chrome", label: "Chrome (sidebar)" },
  { field: "chromeBar", label: "Chrome bar (translucent)" },
  { field: "hover", label: "Hover" },
  { field: "track", label: "Track" },
  { field: "control", label: "Control" },
  { field: "dividerStrong", label: "Divider" },
  { field: "overlay", label: "Modal overlay" },
];

function ThemePanel({
  draft,
  set,
  setTheme,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  setTheme: (p: Partial<LaunchpadTheme>) => void;
}) {
  const toast = useToast();
  const corner = cornerOf(draft.theme);
  const fontId = FONT_STACKS.find((f) => f.value === draft.theme.fontSans)?.id ?? "custom";

  return (
    <>
      <h2>Theme</h2>
      <p className="lp-step-hint">
        Start from a preset, then tune. Your changes are stored token by token — saving an unrelated field no longer
        rebuilds the palette from the preset.
      </p>

      <div className="lp-field">
        <label>Preset</label>
        <p className="lp-field-hint">
          Applying a preset <strong>replaces every colour, radius and shadow</strong>, including anything you tuned
          below. Nothing is written until you press Save.
        </p>
        <div className="lp-presets lp-presets-compact">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="lp-preset"
              onClick={() => {
                set({ theme: { ...p.theme } });
                toast.info(`${p.label} applied — every token was replaced. Reload to discard.`);
              }}
            >
              <span className="lp-preset-swatch" style={{ background: p.swatch.bg }}>
                <span style={{ background: p.swatch.surface }} />
                <span style={{ background: p.swatch.accent }} />
              </span>
              <span className="lp-preset-meta">
                <strong>{p.label}</strong>
              </span>
            </button>
          ))}
        </div>
      </div>

      <fieldset className="lp-group">
        <legend>Colour</legend>
        <ColourField
          id="d-accent"
          label="Accent"
          hint="Hover, deep, soft and line shades plus the gradient are recomputed from this — six tokens from one pick."
          value={draft.theme.accent}
          onChange={(v) => setTheme(accentFamily(v))}
        />
        <ColourField id="d-bg" label="Background" value={draft.theme.bg} onChange={(v) => setTheme({ bg: v })} />
        <ColourField id="d-surface" label="Surface (cards)" value={draft.theme.surface} onChange={(v) => setTheme({ surface: v })} />
        <ColourField id="d-text" label="Text" value={draft.theme.text} onChange={(v) => setTheme({ text: v })} />
        <ColourField id="d-textmuted" label="Text muted" value={draft.theme.textMuted} onChange={(v) => setTheme({ textMuted: v })} />
      </fieldset>

      <details className="lp-disclosure">
        <summary>Semantic colours</summary>
        <ColourField
          id="d-ink"
          label="On-accent text"
          hint="Sits on top of accent-filled buttons. A light accent needs a dark value here or the labels vanish."
          value={draft.theme.ink}
          onChange={(v) => setTheme({ ink: v })}
        />
        <ColourField id="d-up" label="Up / buy" value={draft.theme.up} onChange={(v) => setTheme({ up: v })} />
        <ColourField id="d-down" label="Down / sell" value={draft.theme.down} onChange={(v) => setTheme({ down: v })} />
        <ColourField id="d-hot" label="Hot" value={draft.theme.hot} onChange={(v) => setTheme({ hot: v })} />
      </details>

      <fieldset className="lp-group">
        <legend>Type</legend>
        <div className="lp-field">
          <label htmlFor="d-font">Typeface</label>
          <p className="lp-field-hint">
            A closed list: font stacks may not contain <code>(</code>, so a hosted webfont URL cannot be expressed here
            at all. These families render with no network fetch.
          </p>
          <select
            id="d-font"
            value={fontId}
            onChange={(e) => {
              const f = FONT_STACKS.find((x) => x.id === e.target.value);
              if (f) setTheme({ fontSans: f.value });
            }}
          >
            {fontId === "custom" && <option value="custom">Custom (stored)</option>}
            {FONT_STACKS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="lp-font-sample" style={{ fontFamily: draft.theme.fontSans }}>
            Launch a coin in seconds — 0123456789
          </p>
        </div>
      </fieldset>

      <fieldset className="lp-group">
        <legend>Shape</legend>
        <div className="lp-field">
          <label htmlFor="d-corner">Corners</label>
          <p className="lp-field-hint">Drives all six radius tokens at once.</p>
          <select
            id="d-corner"
            value={corner}
            onChange={(e) => {
              const r = CORNERS[e.target.value];
              if (r) setTheme(r);
            }}
          >
            {corner === "custom" && <option value="custom">Custom (stored)</option>}
            <option value="sharp">Sharp</option>
            <option value="soft">Soft</option>
            <option value="round">Round</option>
          </select>
        </div>
      </fieldset>

      <details className="lp-disclosure">
        <summary>Advanced tokens</summary>
        <p className="lp-field-hint">
          These accept the full colour grammar the validator does, including <code>rgba()</code> — the shipped presets
          use it for the translucent chrome.
        </p>
        {ADVANCED_TOKENS.map((t) => (
          <ColourField
            key={t.field}
            id={`d-${t.field}`}
            label={t.label}
            value={draft.theme[t.field]}
            strict={false}
            onChange={(v) => setTheme({ [t.field]: v } as Partial<LaunchpadTheme>)}
          />
        ))}
      </details>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//                                        SEO & SOCIAL
// ---------------------------------------------------------------------------------------------

function SeoPanel({
  draft,
  set,
  setSeo,
  siteUrl,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  setSeo: (p: Partial<LaunchpadSeo>) => void;
  siteUrl: string;
}) {
  const og = effectiveOg(draft);
  const keywordCount = draft.keywordsText.split(",").map((k) => k.trim()).filter(Boolean).length;

  return (
    <>
      <h2>SEO &amp; social</h2>
      <p className="lp-step-hint">
        What search engines and link previews say about your launchpad. Nobody writes this in the first thirty seconds,
        and everybody needs it eventually.
      </p>

      <TextField
        id="d-seo-title"
        label="Page title"
        hint="Shown in the browser tab, the Google result and the social card headline."
        value={draft.seo.title}
        max={120}
        onChange={(v) => setSeo({ title: v })}
      />

      <TextField
        id="d-seo-desc"
        label="Meta description"
        hint="The paragraph under your Google result. Aim for 140–160 characters."
        value={draft.seo.description}
        max={300}
        multiline
        onChange={(v) => setSeo({ description: v })}
      />

      <details className="lp-disclosure">
        <summary>Per-surface copy</summary>
        <p className="lp-field-hint">Each of these falls back to the meta description when left empty.</p>
        <TextField
          id="d-seo-home"
          label="Homepage description"
          value={draft.seo.homeDescription ?? ""}
          max={300}
          multiline
          onChange={(v) => setSeo({ homeDescription: v || undefined })}
        />
        <TextField
          id="d-seo-og"
          label="Social preview description"
          hint="Shorter and punchier — a long description gets cut mid-sentence in X and Telegram."
          value={draft.seo.ogDescription ?? ""}
          max={300}
          multiline
          onChange={(v) => setSeo({ ogDescription: v || undefined })}
        />
        <TextField
          id="d-seo-site"
          label="Site description (structured data)"
          hint='Written for the crawler ("what is this site"), not for the click.'
          value={draft.seo.siteDescription ?? ""}
          max={300}
          multiline
          onChange={(v) => setSeo({ siteDescription: v || undefined })}
        />
      </details>

      <div className="lp-field">
        <label htmlFor="d-seo-kw">Keywords</label>
        <p className="lp-field-hint">
          Comma separated, up to 20. Empty entries are dropped rather than shipped as an empty keyword.
        </p>
        <input
          id="d-seo-kw"
          value={draft.keywordsText}
          onChange={(e) => set({ keywordsText: stripAngles(e.target.value) })}
          placeholder="meme coin launchpad, bonding curve, fair launch"
        />
        <div className="lp-field-foot">
          <span className={keywordCount > 20 ? "field-err" : "note"}>{keywordCount}/20 keywords</span>
        </div>
      </div>

      <TextField
        id="d-seo-tw"
        label="X / Twitter handle"
        hint="With or without the @. Used for the twitter:site card attribution."
        value={draft.seo.twitterHandle ?? ""}
        max={32}
        onChange={(v) => setSeo({ twitterHandle: v || undefined })}
      />

      <UrlField
        id="d-seo-orglogo"
        label="Organization logo"
        hint="Square brand mark for Google's knowledge panel — structured data, not the sidebar logo. Without it, the platform's own mark is claimed as yours."
        value={draft.seo.organizationLogoUrl ?? ""}
        optional
        onChange={(v) => setSeo({ organizationLogoUrl: v || undefined })}
      />

      <div className="lp-field">
        <label>Canonical URL</label>
        <p className="lp-field-hint">
          Set by the platform and not editable here — it follows your address, not this form. If you have verified a
          custom domain and this still points elsewhere, that is a known gap in the domain flow, not a field you are
          missing.
        </p>
        <code className="lp-readonly">{siteUrl}</code>
      </div>

      <fieldset className="lp-group">
        <legend>Social card</legend>
        <p className="lp-field-hint">
          Rendered as a 1200×630 image at request time. It is drawn by Satori, which has no CSS custom properties and
          no colour functions — every colour must be a flat hex value, and anything that is not 3- or 6-digit hex is
          drawn as fully transparent rather than failing loudly.
        </p>

        <div className="lp-flags">
          <Switch
            label="Match my theme"
            on={draft.ogLinked}
            onToggle={() => set({ ogLinked: !draft.ogLinked })}
            hint="Keeps the card's colours following your site colours"
          />
        </div>
        {draft.ogLinked && (
          <p className="lp-field-hint">
            The four colours below track your theme. Every link you have ever shared re-renders with the new palette
            the moment you save — turn this off if you want the card to differ from the site.
          </p>
        )}

        <ColourField
          id="d-og-accent"
          label="Card accent"
          value={og.ogAccent}
          disabled={draft.ogLinked}
          onChange={(v) => setSeo({ ogAccent: v })}
        />
        <ColourField
          id="d-og-bg"
          label="Card background"
          value={og.ogBackground}
          disabled={draft.ogLinked}
          onChange={(v) => setSeo({ ogBackground: v })}
        />
        <ColourField
          id="d-og-text"
          label="Card text"
          value={og.ogTextPrimary}
          disabled={draft.ogLinked}
          onChange={(v) => setSeo({ ogTextPrimary: v })}
        />
        <ColourField
          id="d-og-text2"
          label="Card text (secondary)"
          value={og.ogTextSecondary}
          disabled={draft.ogLinked}
          onChange={(v) => setSeo({ ogTextSecondary: v })}
        />
        <TextField
          id="d-og-tagline"
          label="Card footer line"
          hint="The small line under the tagline on the card."
          value={draft.seo.ogTagline}
          max={140}
          onChange={(v) => setSeo({ ogTagline: v })}
        />
      </fieldset>
    </>
  );
}

/// Mirrors app/opengraph-image.tsx one-for-one, INCLUDING its failure mode: `hexToRgba` there
/// matches only 3- or 6-digit hex and returns rgba(0,0,0,0) for anything else, so an rgba() or
/// 8-digit colour that the zod schema happily accepts silently loses the accent wash. Reproducing
/// that here is the point — a preview that quietly looks better than the real renderer is a lie.
function ogHexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "rgba(0,0,0,0)";
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function OgCardPreview({ draft }: { draft: Draft }) {
  const og = effectiveOg(draft);
  const satoriSafe = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(og.ogAccent.trim());

  // 1200x630 at 1/2.4 scale. Font sizes are the renderer's own, divided by the same factor.
  const s = (n: number) => `${n / 2.4}px`;

  return (
    <div className="lp-og" aria-label="Social card preview">
      <div
        className="lp-og-card"
        style={{
          backgroundColor: og.ogBackground,
          backgroundImage: `radial-gradient(circle at 50% 36%, ${ogHexToRgba(og.ogAccent, 0.16)}, ${ogHexToRgba(
            og.ogBackground,
            0,
          )} 62%)`,
          color: og.ogTextPrimary,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: s(132), fontWeight: 800, letterSpacing: "-0.04em" }}>
          <span>{draft.name}</span>
          <span style={{ color: og.ogAccent }}>{draft.tld}</span>
        </div>
        <div style={{ fontSize: s(42), marginTop: s(22), textAlign: "center", maxWidth: s(1020) }}>{draft.tagline}</div>
        <div style={{ marginTop: s(46), fontSize: s(30), color: og.ogTextSecondary, letterSpacing: "0.02em" }}>
          {draft.seo.ogTagline}
        </div>
      </div>
      {!satoriSafe && (
        <p className="field-err">
          The card accent is not a 3- or 6-digit hex value, so the real renderer draws its glow fully transparent.
        </p>
      )}
      <p className="note">1200×630, drawn at request time. Shown at 42% scale.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//                                          DOMAINS
// ---------------------------------------------------------------------------------------------

function DomainsTab({ item, apex, onChanged }: { item: Item; apex: string; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [domain, setDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [dns, setDns] = useState<{ cname: { name: string; value: string }; txt: { name: string; value: string } } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function add() {
    setAdding(true);
    try {
      const res = await fetch(`/api/launchpads/${item.slug}/domains`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const j = (await res.json()) as { dns?: typeof dns; error?: string; vercel?: { ok: boolean; error?: string } };
      if (!res.ok) throw new Error(j.error ?? "Could not add the domain");
      setDns(j.dns ?? null);
      setDomain("");
      if (j.vercel && !j.vercel.ok) {
        toast.info(`Domain saved. Platform registration is pending: ${j.vercel.error}`);
      }
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function verify(row: DomainRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/launchpads/${item.slug}/domains/${row.id}/verify`, { method: "POST" });
      const j = (await res.json()) as { verified?: boolean; error?: string; step?: string };
      if (!res.ok || !j.verified) throw new Error(j.error ?? "Not verified yet");
      toast.success(`${row.domain} verified`);
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="lp-step">
      <h2>Custom domains</h2>
      <p className="lp-step-hint">
        {apex ? (
          <>
            Your launchpad already lives at <code>{item.slug}.{apex}</code>. Add your own domain to serve it there too.
          </>
        ) : (
          <>
            No apex domain is configured on this deployment, so launchpads do not get a hostname of their own. Yours is
            reachable at <code>/?tenant={item.slug}</code>. Add your own domain to serve it properly.
          </>
        )}
      </p>

      <div className="lp-domain-add">
        <input
          value={domain}
          placeholder="launch.yourdomain.com"
          aria-label="Custom domain"
          onChange={(e) => setDomain(e.target.value.trim().toLowerCase())}
        />
        <button onClick={add} disabled={adding || domain.length < 4}>
          {adding ? "Adding…" : "Add domain"}
        </button>
      </div>

      {dns && (
        <div className="lp-dns">
          <p className="note">Add these two records at your DNS provider, then press Verify.</p>
          <DnsRow type="CNAME" name={dns.cname.name} value={dns.cname.value} />
          <DnsRow type="TXT" name={dns.txt.name} value={dns.txt.value} />
          <p className="note">
            DNS changes usually appear within a few minutes but can take up to an hour. Verification checks the TXT
            record first, then whether the hostname actually points here.
          </p>
        </div>
      )}

      <div className="lp-domain-list">
        {item.domains.length === 0 && <p className="note">No custom domains yet.</p>}
        {item.domains.map((d) => (
          <div key={d.id} className="lp-domain-row">
            <span className="lp-domain-name">{d.domain}</span>
            <span className={d.verified ? "badge live" : "badge"}>{d.verified ? "verified" : "pending"}</span>
            {!d.verified && (
              <>
                <button className="secondary" onClick={() => verify(d)} disabled={busy === d.id}>
                  {busy === d.id ? "Checking…" : "Verify"}
                </button>
                <details className="lp-domain-help">
                  <summary>Records</summary>
                  <DnsRow type="CNAME" name={d.domain} value="cname.vercel-dns.com" />
                  <DnsRow type="TXT" name={`_launchpad-verify.${d.domain}`} value={d.verificationToken} />
                </details>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function DnsRow({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <div className="lp-dns-row">
      <span className="lp-dns-type">{type}</span>
      <code className="lp-dns-name">{name}</code>
      <code className="lp-dns-value">{value}</code>
      <button
        className="secondary"
        aria-label={`Copy ${value}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
        }}
      >
        Copy
      </button>
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<{ tokens: number; trades: number } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_INDEXER_URL ?? "";
        const res = await fetch(`${base}/api/tokens?limit=200`);
        const j = (await res.json()) as { tokens?: { tradeCount?: number }[] };
        const tokens = j.tokens ?? [];
        setStats({ tokens: tokens.length, trades: tokens.reduce((a, t) => a + (t.tradeCount ?? 0), 0) });
      } catch {
        setStats(null);
      }
    })();
  }, []);

  return (
    <section className="lp-step">
      <h2>Stats</h2>
      <div className="prof-stats">
        <span>
          <strong>{stats?.tokens ?? "—"}</strong> coins on the network
        </span>
        <span>
          <strong>{stats?.trades ?? "—"}</strong> trades
        </span>
      </div>
      <p className="note">
        These are network-wide totals. Per-launchpad attribution needs the coin to record which launchpad it was
        created from, which is an on-chain change — coming with the contract phase.
      </p>
    </section>
  );
}
