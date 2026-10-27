"use client";

import { MenuIcon } from "./icons";

export function Topbar({
  onMenu,
  crumb,
}: {
  onMenu: () => void;
  crumb: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-[var(--z-raised)] border-b"
      style={{
        background: "var(--color-paper)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div className="flex min-h-16 items-center gap-3 px-4 py-2 sm:px-8">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          aria-controls="app-sidebar"
          className="icon-btn h-10 w-10 shrink-0 lg:hidden"
        >
          <MenuIcon />
        </button>
        <nav
          aria-label="Breadcrumb"
          className="mono min-w-0 flex-1 truncate text-sm"
          style={{ color: "var(--color-ink-2)" }}
        >
          {crumb}
        </nav>
        <span
          className="tag hidden px-2 py-1 text-xs md:inline-flex"
          style={{
            background: "var(--color-warn-soft)",
            color: "var(--color-ink)",
          }}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
          Sample data
        </span>
        <span
          className="tag hidden px-2 py-1 text-xs sm:inline-flex"
          style={{ background: "var(--color-ok-soft)", color: "var(--color-ink)" }}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--color-ok)" }}
          />
          All systems normal
        </span>
      </div>
    </header>
  );
}
