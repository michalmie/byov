"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { appHealth, type App } from "@/lib/control-plane";
import { useManagedApps } from "@/lib/apps-store";
import { useManagedNodes } from "@/lib/settings-store";
import { useManagedStacks } from "@/lib/stack-store";
import {
  ArrowRightIcon,
  BoxIcon,
  CloseIcon,
  DocIcon,
  GearIcon,
  GridIcon,
  LayersIcon,
  PulseIcon,
  SearchIcon,
  StackIcon,
} from "./icons";
import { Logo } from "./logo";

const healthDot: Record<string, string> = {
  healthy: "var(--color-ok)",
  deploying: "var(--color-info)",
  degraded: "var(--color-warn)",
  down: "var(--color-bad)",
  pending: "var(--color-info)",
};

const workspaceNav = [
  { href: "/", label: "Dashboard", icon: GridIcon, exact: true },
  { href: "/apps", label: "Apps", icon: BoxIcon, exact: false },
  { href: "/stacks", label: "Tech stacks", icon: LayersIcon, exact: false },
  { href: "/nodes", label: "Nodes", icon: StackIcon, exact: true },
  { href: "/activity", label: "Activity", icon: PulseIcon, exact: true },
];

const configNav = [
  { href: "/settings", label: "Settings", icon: GearIcon, exact: false },
];

const resourceNav = [
  { href: "/docs", label: "Docs", icon: DocIcon, exact: false },
];

/** Case-insensitive substring match over app names (sidebar search). */
export function filterApps(apps: App[], query: string): App[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return apps;
  }
  return apps.filter((app) => app.name.toLowerCase().includes(needle));
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { apps } = useManagedApps();
  const { nodes } = useManagedNodes();
  const { stacks } = useManagedStacks();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const counts: Record<string, number> = {
    "/apps": apps.length,
    "/stacks": stacks.length,
    "/nodes": nodes.length,
  };
  const matches = filterApps(apps, query);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const renderNavItem = (item: { href: string; label: string; icon: typeof GridIcon; exact: boolean }) => {
    const active = isActive(item.href, item.exact);
    const Icon = item.icon;
    const count = counts[item.href];
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onClose}
        className="rail-link px-2 py-1.5 text-sm"
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
        {count !== undefined && (
          <span
            className="tnum ml-auto text-xs"
            style={{ color: "var(--color-muted)" }}
          >
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      id="app-sidebar"
      aria-label="Control plane navigation"
      className={`rail drawer fixed inset-y-0 left-0 z-[var(--z-sticky)] flex w-[216px] flex-col gap-5 overflow-y-auto border-r px-3 py-4 lg:translate-x-0 lg:visible ${
        open ? "translate-x-0 visible" : "-translate-x-full invisible"
      }`}
      style={{ borderColor: "var(--color-rail-line)" }}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <Link
          href="/"
          onClick={onClose}
          className="inline-flex items-center"
        >
          <Logo className="h-8 w-auto rounded-[6px]" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="icon-btn h-8 w-8 lg:hidden"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div
        role="search"
        className="flex items-center gap-2 rounded-[var(--radius-well)] border px-2 py-1.5"
        style={{
          background: "var(--color-paper)",
          borderColor: "transparent",
          color: "var(--color-muted)",
        }}
      >
        <SearchIcon
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <span className="sr-only">
          <label htmlFor="sidebar-search">Search apps</label>
        </span>
        <input
          ref={searchRef}
          id="sidebar-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          autoComplete="off"
          className="w-full min-w-0 bg-transparent text-[13px] outline-none"
          style={{ color: "var(--color-ink)" }}
        />
        <kbd className="kbd shrink-0" aria-hidden="true">
          ⌘K
        </kbd>
      </div>

      <nav aria-label="Workspace" className="grid gap-0.5">
        <p className="rail-label px-2 pb-1">Workspace</p>
        {workspaceNav.map(renderNavItem)}
      </nav>

      <nav aria-label="Configuration" className="grid gap-0.5">
        <p className="rail-label px-2 pb-1">Configuration</p>
        {configNav.map(renderNavItem)}
      </nav>

      <nav aria-label="Resources" className="grid gap-0.5">
        <p className="rail-label px-2 pb-1">Resources</p>
        {resourceNav.map(renderNavItem)}
      </nav>

      <nav aria-label="App shortcuts" className="grid gap-0.5">
        <p className="rail-label px-2 pb-1">App shortcuts</p>
        {matches.map((app) => {
          const active = pathname === `/apps/${app.slug}`;
          return (
            <Link
              key={app.slug}
              href={`/apps/${app.slug}`}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className="rail-link px-2 py-1.5 text-sm"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: healthDot[appHealth(app)] }}
              />
              <span className="truncate">{app.name}</span>
            </Link>
          );
        })}
        {matches.length === 0 && (
          <p
            className="px-2 py-1 text-[13px]"
            style={{ color: "var(--color-muted)" }}
          >
            No apps match “{query.trim()}”.
          </p>
        )}
        <Link
          href="/apps"
          onClick={onClose}
          className="rail-link mt-1 px-2 py-1.5 text-[13px]"
        >
          View all apps
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </nav>

      <div className="mt-auto">
        <Link
          href="/settings/general"
          onClick={onClose}
          className="rail-link px-2 py-1.5 text-[13px]"
        >
          <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
            style={{
              background: "var(--color-accent)",
              color: "var(--color-card)",
            }}
          >
            M
          </span>
          Workspace settings
        </Link>
      </div>
    </aside>
  );
}
