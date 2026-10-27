"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BellIcon,
  BoxIcon,
  ChevronDownIcon,
  GearIcon,
  LayersIcon,
  MenuIcon,
  PlusIcon,
  StackIcon,
} from "./icons";

export function Topbar({
  onMenu,
  crumb,
  attention,
}: {
  onMenu: () => void;
  crumb: React.ReactNode;
  attention: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  return (
    <header
      className="sticky top-0 z-[var(--z-raised)] border-b"
      style={{
        background: "var(--color-card)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div className="flex min-h-[52px] items-center gap-2 px-4 py-2 sm:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          aria-controls="app-sidebar"
          className="icon-btn h-8 w-8 shrink-0 lg:hidden"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
        <nav
          aria-label="Breadcrumb"
          className="min-w-0 flex-1 truncate text-sm"
          style={{ color: "var(--color-ink-2)" }}
        >
          {crumb}
        </nav>

        <Link
          href="/activity"
          aria-label={
            attention > 0
              ? `Activity, ${attention} apps need attention`
              : "Activity"
          }
          className="icon-btn relative h-8 w-8 shrink-0"
        >
          <BellIcon className="h-4 w-4" />
          {attention > 0 && (
            <span
              aria-hidden="true"
              className="tnum absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold leading-none"
              style={{
                background: "var(--color-bad)",
                color: "var(--color-card)",
              }}
            >
              {attention}
            </span>
          )}
        </Link>

        <Link
          href="/"
          aria-label={
            attention > 0
              ? `Fleet status: ${attention} need attention`
              : "Fleet status: all healthy"
          }
          className="tag hidden shrink-0 border px-2 py-1 md:inline-flex"
          style={{
            background: "var(--color-card)",
            borderColor: "var(--color-rule)",
          }}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{
              background:
                attention > 0 ? "var(--color-warn)" : "var(--color-ok)",
            }}
          />
          Status
        </Link>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="btn-ghost px-2.5 py-1.5 text-[13px]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label="Create new"
              className="menu absolute right-0 top-full z-[var(--z-dropdown)] mt-1.5 grid w-56 gap-0.5 p-1.5"
            >
              <Link
                role="menuitem"
                href="/templates"
                onClick={() => setMenuOpen(false)}
                className="menu-link px-2 py-1.5 text-[13px]"
              >
                <LayersIcon className="h-4 w-4 shrink-0" />
                App from template
              </Link>
              <Link
                role="menuitem"
                href="/settings/nodes"
                onClick={() => setMenuOpen(false)}
                className="menu-link px-2 py-1.5 text-[13px]"
              >
                <StackIcon className="h-4 w-4 shrink-0" />
                Add node
              </Link>
              <Link
                role="menuitem"
                href="/apps"
                onClick={() => setMenuOpen(false)}
                className="menu-link px-2 py-1.5 text-[13px]"
              >
                <BoxIcon className="h-4 w-4 shrink-0" />
                Browse apps
              </Link>
            </div>
          )}
        </div>

        <Link
          href="/settings"
          aria-label="Settings"
          className="icon-btn h-8 w-8 shrink-0"
        >
          <GearIcon className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
