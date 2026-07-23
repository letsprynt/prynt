"use client";

import { useCallback, useEffect, useState } from "react";
import {
  onPreviewMessage,
  postPreviewMessage,
  readDraft,
  sweepStaleDrafts,
  type PreviewDraftInput,
} from "./handoff";
import { PreviewStage } from "./PreviewStage";

// The "open in a new tab" half of the preview. The draft never touches the server: it is handed
// over through localStorage (keyed by a random id in the fragment) and kept current over a
// BroadcastChannel. Everything received here is untrusted and re-validated inside PreviewStage.

export function PreviewRoute() {
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PreviewDraftInput | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [cantClose, setCantClose] = useState(false);

  // Reads the fragment on mount AND on every hashchange. The mount-only version worked for the
  // intended flow (window.open always carries the id) but made the route impossible to point at a
  // different draft without a hard reload — and it would silently keep showing the old draft if the
  // editor ever reused an open preview tab by rewriting its hash.
  useEffect(() => {
    const read = () => {
      sweepStaleDrafts();
      const hash = window.location.hash.replace(/^#/, "");
      if (!/^[0-9a-f]{4,64}$/.test(hash)) return;
      setId(hash);
      setFrozen(false);
      setDraft((readDraft(hash) as PreviewDraftInput | null) ?? null);
      // Ask the editor for its current state, in case this tab was reloaded after an edit.
      postPreviewMessage({ type: "hello", id: hash });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    if (!id) return;
    return onPreviewMessage(id, (m) => {
      if (m.type === "draft") {
        setDraft(m.draft);
        setFrozen(false);
      } else if (m.type === "bye") {
        setFrozen(true);
      }
    });
  }, [id]);

  // This tab was opened by script, so close() is normally permitted. When the browser refuses
  // (a manually opened or restored tab) say so rather than leaving a dead button.
  const exit = useCallback(() => {
    window.close();
    setTimeout(() => setCantClose(true), 200);
  }, []);

  return (
    <>
      <PreviewStage draft={draft} onExit={exit} mode="tab" frozen={frozen} />
      {cantClose && (
        <p className="note" role="status">
          Close this tab to return to the editor.
        </p>
      )}
    </>
  );
}
