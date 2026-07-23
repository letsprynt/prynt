"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_CONFIG, type LaunchpadConfig } from "@/lib/launchpad-config";
import { LaunchpadProvider } from "@/lib/launchpad-context";
import { UiProvider } from "@/lib/ui";
import { useMounted } from "@/lib/useMounted";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { BottomNav } from "@/components/shell/BottomNav";
import { TokenBoard } from "@/components/board/TokenBoard";
import { parsePreviewDraft, type PreviewDraftInput } from "./handoff";
import { themeToStyleObject, themeUrlVars } from "./theme-style";
import s from "./preview-stage.module.css";

// ── The full-page preview ────────────────────────────────────────────────────────────────────────
//
// Not a mock. This mounts the REAL Sidebar, TopBar, BottomNav and TokenBoard — the same components
// a tenant host serves at "/" — inside a wrapper carrying the draft's CSS custom properties. If a
// preset breaks the sidebar's contrast or the King-of-the-Hill hero, it breaks here identically.
//
// WHY AN OVERLAY AND NOT A PLAIN PAGE. app/layout.tsx wraps every route in <AppShell>, so a route
// that rendered a board would render it inside PRYNT's sidebar and topbar. Escaping that needs a
// second root layout, i.e. surgery on the file that owns theme emission for every existing tenant.
// A portal to document.body escapes it with no change to any shared file — and it is also what lets
// the same component serve the same-tab overlay (where the draft is a prop and cannot desync) and
// the /launchpad-preview route (where it arrives over the handoff channel).
//
// isPlatform={false} is deliberate: a tenant host serves the board with the APP chrome, so
// previewing the platform's marketing header would be a lie.

export type StageMode = "overlay" | "tab";

/// Board-local controls the activation guard lets through — see the guard for the argument.
const LIVE = ".board-search, .pills, .view-toggle, .board-state button.secondary";

export function PreviewStage({
  draft,
  onExit,
  mode,
  frozen = false,
}: {
  /// Deliberately unvalidated at the type level. Whatever this is — a prop from the editor or a
  /// blob any script on this origin could have written to localStorage — it goes through
  /// parsePreviewDraft() below before a single character reaches a style attribute.
  draft: PreviewDraftInput | null;
  onExit: () => void;
  mode: StageMode;
  /// Tab mode only: the editor that was feeding this preview has gone away.
  frozen?: boolean;
}) {
  const mounted = useMounted();
  const stageRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  const parsed = useMemo(() => (draft ? parsePreviewDraft(draft) : null), [draft]);

  // ── Escape, focus trap, scroll lock, and hiding the page behind from assistive tech ───────────
  useEffect(() => {
    if (!mounted) return;
    const stage = stageRef.current;

    const focusables = () =>
      stage
        ? Array.from(
            stage.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => stage?.querySelector<HTMLElement>("[data-preview-exit]")?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Only possible BECAUSE the stage is portaled out of .shell: this removes the platform's own
    // sidebar/topbar landmarks (and their duplicate "Home" links) from the a11y tree while the
    // preview's are on screen. An in-place overlay would have inerted itself.
    //
    // The stage renders its OWN .shell, so the set is filtered by containment rather than taken as
    // "the first .shell in document order". Document order happens to be correct today only because
    // this route always gets the app shell and the portal is appended to <body> after it — inerting
    // our own board because the portal moved would leave a dead, aria-hidden rectangle.
    const inerted = Array.from(document.querySelectorAll<HTMLElement>(".shell")).filter(
      (el) => !stage?.contains(el) && !el.hasAttribute("inert"),
    );
    inerted.forEach((el) => el.setAttribute("inert", ""));

    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      inerted.forEach((el) => el.removeAttribute("inert"));
      previouslyFocused?.focus?.();
    };
  }, [mounted]);

  // ── Android back / browser back closes the preview instead of leaving the editor ──────────────
  // There is no Escape key on a phone, and navigating away from the wizard would destroy the whole
  // unsaved draft. A history entry makes "back" mean "close the preview".
  useEffect(() => {
    if (!mounted || mode !== "overlay") return;
    let closedByPop = false;
    const onPop = () => {
      closedByPop = true;
      exitRef.current();
    };
    window.history.pushState({ lpPreview: true }, "");
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const st = window.history.state as { lpPreview?: boolean } | null;
      if (!closedByPop && st?.lpPreview) window.history.back();
    };
  }, [mounted, mode]);

  // ── Activation guard ─────────────────────────────────────────────────────────────────────────
  // The preview's chrome is REAL: the sidebar links are next/link navigations, and TopBar's Create
  // button calls useUi().openCreate() — which would open the actual CreateModal, mounted by
  // AppShell OUTSIDE this overlay, unthemed and perfectly capable of launching a real coin. Hover,
  // scroll and every visual state stay live; activation does not.
  //
  // …with one deliberate exception. A preview where the search box swallows the space bar and the
  // "Retry" button under "Couldn't reach the indexer" cannot be pressed is worse than one where the
  // board's OWN controls work: they only change which coins this stage draws, and the stage's own
  // <UiProvider> (below) means that state can no longer reach — or outlive — the real app. Anything
  // that navigates or persists stays blocked, which is why anchors and the two `role="switch"`
  // filters (they write prynt:graduatedOnly / prynt:showSensitive to localStorage on toggle) are
  // excluded by name rather than by container.
  const isLive = useCallback((t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    if (!el?.closest) return false;
    if (el.closest('a[href],[role="switch"]')) return false;
    return Boolean(el.closest(LIVE));
  }, []);

  const block = useCallback(
    (e: { target: EventTarget | null; preventDefault: () => void; stopPropagation: () => void }) => {
      const t = e.target as HTMLElement | null;
      const hit = t?.closest?.('a[href],button,[role="switch"],input,select,textarea,label,summary');
      if (!hit || isLive(t)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [isLive],
  );
  const blockKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") block(e);
    },
    [block],
  );

  const cfg: LaunchpadConfig | null = useMemo(() => {
    if (!parsed?.ok) return null;
    const d = parsed.draft;
    return {
      ...DEFAULT_CONFIG,
      slug: d.slug ?? "preview",
      domains: [],
      name: d.name,
      tld: d.tld,
      tagline: d.tagline,
      logoUrl: d.logoUrl,
      kothBgUrl: d.kothBgUrl,
      theme: d.theme,
      links: d.links,
      features: d.features,
      ownerAddress: undefined,
      treasuryAddress: undefined,
      seo: {
        ...DEFAULT_CONFIG.seo,
        // No tagline yet is a legitimate draft state, and " — " with nothing after it is the kind
        // of placeholder debris the preview is supposed to expose rather than emit.
        title: d.tagline ? `${d.name}${d.tld} — ${d.tagline}` : `${d.name}${d.tld}`,
        description: d.tagline,
      },
    };
  }, [parsed]);

  const themeStyle = useMemo(
    () =>
      cfg
        ? { ...themeToStyleObject(cfg.theme), ...themeUrlVars(cfg.logoUrl, cfg.kothBgUrl) }
        : undefined,
    [cfg],
  );

  if (!mounted) return null;

  const brand = cfg ? `${cfg.name}${cfg.tld}` : "Preview";

  const stage = (
    <div
      className={s.stage}
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Full-page preview of ${brand}`}
    >
      <div className={s.bar}>
        <span className={s.barLabel}>
          Preview — <strong>{brand}</strong>
          {/* Says exactly what the activation guard does. The old copy claimed buttons were inert
              while the search box happily accepted typing, which is the one instruction on screen
              being wrong. */}
          {cfg ? " · search and sort work · links go nowhere" : ""}
        </span>
        <span className={s.spacer} />
        <span className={s.kbd}>Esc</span>
        <button type="button" className="secondary" data-preview-exit onClick={onExit}>
          {mode === "overlay" ? "Back to editing" : "Close preview"}
        </button>
      </div>

      {frozen && (
        <p className={s.frozen}>
          This preview is frozen — the editor tab that was feeding it has closed. Reopen it from the
          wizard to see live edits again.
        </p>
      )}

      <div
        className={s.viewport}
        style={themeStyle}
        onClickCapture={block}
        onKeyDownCapture={blockKey}
      >
        {!parsed ? (
          <div className={s.state}>
            <h2>Nothing to preview</h2>
            <p>
              This preview link has expired or was opened directly. Open it again from your
              launchpad editor.
            </p>
          </div>
        ) : !parsed.ok ? (
          // A draft that fails validation renders THIS, never a half-themed page: applying the
          // fields that happened to pass would show the creator a theme the API would then reject.
          <div className={s.state}>
            <h2>This draft can’t be previewed</h2>
            <p>
              Some values wouldn’t survive validation, so nothing was applied. Fix these in the
              editor and try again — the same rules run when you save.
            </p>
            <ul className={s.issues}>
              {parsed.issues.map((i, n) => (
                <li key={`${i.path}-${n}`}>
                  <code>{i.path}</code> — {i.message}
                </li>
              ))}
            </ul>
          </div>
        ) : cfg == null ? null : (
          // The stage gets its OWN UiProvider. createPortal preserves React context, so without
          // this the portaled TokenBoard/BoardSearch would resolve useUi() to the APP's single
          // provider: a search typed inside a throwaway preview would then filter the real board
          // behind it and outlive the preview, and TopBar's Create would set createOpen on the
          // provider whose CreateModal is mounted outside this overlay. A nested provider shadows
          // it for this subtree only — the leak and the live-modal risk both disappear.
          <UiProvider>
            <LaunchpadProvider config={cfg}>
              <div className="shell">
                <Sidebar isPlatform={false} />
                <div className="shell-main">
                  <TopBar />
                  <main className="shell-content">
                    <h1 className="sr-only">{cfg.seo.title}</h1>
                    <TokenBoard />
                  </main>
                </div>
                <BottomNav />
              </div>
            </LaunchpadProvider>
          </UiProvider>
        )}
      </div>
    </div>
  );

  return createPortal(stage, document.body);
}

/// Small helper so the editor side does not have to own the open/close plumbing.
export function usePreviewOverlay(): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(false);
  return [open, useCallback(() => setOpen(true), []), useCallback(() => setOpen(false), [])];
}
