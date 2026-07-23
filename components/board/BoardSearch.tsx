"use client";

import { useEffect, useRef } from "react";
import { useUi } from "@/lib/ui";
import { IconSearch, IconClose } from "@/components/icons";

// Prominent board search — lives at the top of the home board. ⌘K / Ctrl+K focuses it.
export function BoardSearch() {
  const { search, setSearch } = useUi();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="board-search">
      <span className="board-search-ico"><IconSearch size={19} /></span>
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tokens…"
        spellCheck={false}
        autoComplete="off"
      />
      {search ? (
        <button className="board-search-clear" onClick={() => setSearch("")} aria-label="clear search">
          <IconClose size={15} />
        </button>
      ) : (
        <span className="kbd board-search-kbd">⌘K</span>
      )}
    </div>
  );
}
