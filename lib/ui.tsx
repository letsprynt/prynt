"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Sort } from "./api";

const SHOW_GRADUATED_KEY = "prynt:graduatedOnly"; // new key: semantics changed from "include graduated" to "graduated ONLY"
const SHOW_SENSITIVE_KEY = "prynt:showSensitive";

type Ui = {
  createOpen: boolean;
  openCreate: () => void;
  closeCreate: () => void;
  search: string;
  setSearch: (s: string) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  showGraduated: boolean;
  setShowGraduated: (v: boolean) => void;
  showSensitive: boolean;
  setShowSensitive: (v: boolean) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
};

const Ctx = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  // "Graduated" filter: OFF (default) = show ALL coins; ON = show ONLY graduated coins. Persisted so it survives
  // refreshes. Start from the default (false) for SSR/first render to avoid a hydration mismatch, then hydrate.
  const [showGraduated, setShowGraduatedState] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem(SHOW_GRADUATED_KEY);
    if (v !== null) setShowGraduatedState(v === "1");
  }, []);
  const setShowGraduated = (v: boolean) => {
    setShowGraduatedState(v);
    try {
      localStorage.setItem(SHOW_GRADUATED_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable (private mode) — fall back to in-memory only */
    }
  };
  // Sensitive (NSFW) content is HIDDEN by default; the opt-in reveal persists across refreshes.
  const [showSensitive, setShowSensitiveState] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(SHOW_SENSITIVE_KEY) === "1") setShowSensitiveState(true);
  }, []);
  const setShowSensitive = (v: boolean) => {
    setShowSensitiveState(v);
    try {
      localStorage.setItem(SHOW_SENSITIVE_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Ctx.Provider
      value={{
        createOpen,
        openCreate: () => setCreateOpen(true),
        closeCreate: () => setCreateOpen(false),
        search,
        setSearch,
        sort,
        setSort,
        showGraduated,
        setShowGraduated,
        showSensitive,
        setShowSensitive,
        collapsed,
        toggleCollapsed: () => setCollapsed((v) => !v),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useUi() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUi must be used within <UiProvider>");
  return c;
}
