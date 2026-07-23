"use client";

import { useEffect, useRef } from "react";
import { useUi } from "@/lib/ui";
import { CreateTokenForm } from "@/components/CreateTokenForm";
import { IconClose } from "@/components/icons";

export function CreateModal() {
  const { createOpen, closeCreate } = useUi();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createOpen) return;
    const card = cardRef.current;
    const focusables = () =>
      card
        ? Array.from(
            card.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];
    const t = setTimeout(() => focusables()[0]?.focus(), 0); // move focus into the dialog on open

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCreate();
        return;
      }
      if (e.key === "Tab") {
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
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // scroll lock behind the modal

    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [createOpen, closeCreate]);

  if (!createOpen) return null;
  return (
    <div className="modal-overlay" onClick={closeCreate}>
      <div
        className="modal-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Launch a token"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close secondary" onClick={closeCreate} aria-label="Close">
          <IconClose size={16} />
        </button>
        <CreateTokenForm onCreated={closeCreate} />
      </div>
    </div>
  );
}
