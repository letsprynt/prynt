"use client";

import { useDismissToast, useToasts } from "@/lib/toast";
import { IconAlert, IconCheck, IconClose } from "./icons";

export function Toaster() {
  const toasts = useToasts();
  const dismiss = useDismissToast();
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-ico">
            {t.kind === "loading" ? (
              <span className="spinner" />
            ) : t.kind === "success" ? (
              <IconCheck size={16} />
            ) : t.kind === "error" ? (
              <IconAlert size={16} />
            ) : (
              <span className="dot" />
            )}
          </span>
          <span className="toast-msg">{t.msg}</span>
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
