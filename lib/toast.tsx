"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastKind = "loading" | "success" | "error" | "info";
export type Toast = { id: number; kind: ToastKind; msg: string };

type Api = {
  toasts: Toast[];
  push: (kind: ToastKind, msg: string) => number;
  update: (id: number, kind: ToastKind, msg: string) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const tm = timers.current.get(id);
    if (tm) clearTimeout(tm);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      const prev = timers.current.get(id);
      if (prev) clearTimeout(prev);
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const push = useCallback(
    (kind: ToastKind, msg: string) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, kind, msg }]);
      if (kind !== "loading") schedule(id, kind === "error" ? 6500 : 4500);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, kind: ToastKind, msg: string) => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, kind, msg } : x)));
      if (kind !== "loading") schedule(id, kind === "error" ? 6500 : 4500);
    },
    [schedule],
  );

  return <Ctx.Provider value={{ toasts, push, update, dismiss }}>{children}</Ctx.Provider>;
}

function useCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error("toast hooks must be used within <ToastProvider>");
  return c;
}

/// Imperative toast API for components firing tx-lifecycle notifications.
export function useToast() {
  const c = useCtx();
  return {
    loading: (msg: string) => c.push("loading", msg),
    success: (msg: string) => c.push("success", msg),
    error: (msg: string) => c.push("error", msg),
    info: (msg: string) => c.push("info", msg),
    update: c.update,
    dismiss: c.dismiss,
  };
}

export function useToasts() {
  return useCtx().toasts;
}
export function useDismissToast() {
  return useCtx().dismiss;
}

/// Turn a wallet/RPC error into a short human line (user-rejected, insufficient funds, revert reason…).
export function shortTxError(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/user rejected|denied|rejected the request/i.test(m)) return "Rejected in wallet";
  if (/insufficient funds/i.test(m)) return "Insufficient funds for gas";
  if (/slippage|SlippageExceeded/i.test(m)) return "Slippage too low — raise it and retry";
  if (/deadline|Expired|PermitExpired/i.test(m)) return "Signature/transaction deadline passed — retry";
  if (/ZeroAmount|0x1f2a2005|INSUFFICIENT_OUTPUT_AMOUNT|INSUFFICIENT_INPUT_AMOUNT/i.test(m)) return "Amount too small to trade";
  // permit path: a stale/invalid permit signature leaves no allowance, surfacing as an ERC20 allowance error
  if (/insufficient allowance|InsufficientAllowance|InvalidSigner/i.test(m)) return "Approval signature was invalid or already used — try selling again";
  return m.split("\n")[0].slice(0, 120);
}
