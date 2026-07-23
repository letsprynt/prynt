import { z } from "zod";
import {
  featuresSchema,
  linksSchema,
  safeUrl,
  themeSchema,
} from "@/lib/launchpad-schema";

// ── The draft handoff ────────────────────────────────────────────────────────────────────────────
//
// A wizard draft has never been saved: there is no row, no slug reservation, and middleware.ts's
// ?tenant= path only ever resolves a PERSISTED slug (lib/launchpad-server.ts -> getBySlug). So the
// full-page preview cannot ride on the tenant resolver — the draft has to travel client-side.
//
// Two transports, and the difference matters:
//   - SAME TAB (the primary): none. The overlay is in the same React tree as the editor and takes
//     the draft as a prop, so desync is impossible and there is nothing to clean up.
//   - NEW TAB (the secondary): localStorage for the initial handoff + BroadcastChannel for live
//     edits. sessionStorage is NOT cloned into a window opened with `noopener`, and a URL fragment
//     would have to carry ~1.1 KB of theme JSON and be rewritten on every keystroke.
//
// Either way the receiving side re-validates. On the localStorage path that is not a formality:
// anything on this origin can write that key, and the value is about to become a style attribute.

const STORE_PREFIX = "lp:preview:";
const CHANNEL = "lp-preview";
/// A stale handoff is a draft nobody is editing any more. Swept on every read, and on the editor's
/// own unmount/pagehide — so the key does not outlive the tab that created it.
const MAX_AGE_MS = 60 * 60 * 1000;

/// Mirrors the private `text()` helper in lib/launchpad-schema.ts (angle brackets are STRIPPED, not
/// rejected, so "A < B" in a tagline is not blocked). Duplicated because that helper is not
/// exported; see the report — the honest fix is to export it rather than keep two copies.
const displayText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.replace(/[<>]/g, ""));

export const previewDraftSchema = z.object({
  v: z.literal(1),
  slug: z.string().trim().max(64).optional(),
  name: displayText(32),
  tld: displayText(16),
  tagline: displayText(140),
  logoUrl: safeUrl,
  kothBgUrl: safeUrl,
  theme: themeSchema,
  features: featuresSchema,
  links: linksSchema.default({}),
});

export type PreviewDraft = z.output<typeof previewDraftSchema>;
export type PreviewDraftInput = z.input<typeof previewDraftSchema>;

export type PreviewParse =
  | { ok: true; draft: PreviewDraft }
  | { ok: false; issues: { path: string; message: string }[] };

/// The single validation gate. BOTH transports go through it, and nothing downstream is allowed to
/// touch a raw value: a draft that fails here renders an error, never a half-themed page.
export function parsePreviewDraft(raw: unknown): PreviewParse {
  const r = previewDraftSchema.safeParse(raw);
  if (r.success) return { ok: true, draft: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({
      path: i.path.join(".") || "(root)",
      message: i.message,
    })),
  };
}

// ── Cross-tab transport ──────────────────────────────────────────────────────────────────────────

export type PreviewMessage =
  | { type: "draft"; id: string; draft: PreviewDraftInput }
  | { type: "hello"; id: string }
  | { type: "bye"; id: string };

function channel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CHANNEL);
}

export function newPreviewId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/// Drop every handoff older than MAX_AGE_MS. Cheap, and it is what stops an abandoned tab from
/// leaving a theme blob in localStorage forever.
export function sweepStaleDrafts(): void {
  if (typeof localStorage === "undefined") return;
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(STORE_PREFIX)) continue;
    try {
      const { ts } = JSON.parse(localStorage.getItem(key) ?? "{}") as { ts?: number };
      if (typeof ts !== "number" || now - ts > MAX_AGE_MS) localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key); // unparseable → not ours to keep
    }
  }
}

export function publishDraft(id: string, draft: PreviewDraftInput): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORE_PREFIX + id, JSON.stringify({ ts: Date.now(), draft }));
  } catch {
    /* quota or private mode — the BroadcastChannel below still carries the live edit */
  }
  const ch = channel();
  ch?.postMessage({ type: "draft", id, draft } satisfies PreviewMessage);
  ch?.close();
}

/// Called when the editor closes the preview, unmounts, or the page is hidden. Removes the key AND
/// tells the preview tab it is now frozen, so it can say so instead of silently drifting.
export function retireDraft(id: string): void {
  try {
    localStorage?.removeItem(STORE_PREFIX + id);
  } catch {
    /* ignore */
  }
  const ch = channel();
  ch?.postMessage({ type: "bye", id } satisfies PreviewMessage);
  ch?.close();
}

export function readDraft(id: string): unknown | null {
  sweepStaleDrafts();
  try {
    const raw = localStorage?.getItem(STORE_PREFIX + id);
    if (!raw) return null;
    const { draft } = JSON.parse(raw) as { draft?: unknown };
    return draft ?? null;
  } catch {
    return null;
  }
}

/// Subscribe to messages for one preview id. Returns an unsubscribe.
export function onPreviewMessage(id: string, fn: (m: PreviewMessage) => void): () => void {
  const ch = channel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent<PreviewMessage>) => {
    if (e.data && typeof e.data === "object" && e.data.id === id) fn(e.data);
  };
  ch.addEventListener("message", handler);
  return () => {
    ch.removeEventListener("message", handler);
    ch.close();
  };
}

export function postPreviewMessage(m: PreviewMessage): void {
  const ch = channel();
  ch?.postMessage(m);
  ch?.close();
}

export const PREVIEW_ROUTE = "/launchpad-preview";
