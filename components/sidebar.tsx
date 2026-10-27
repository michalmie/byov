"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appHealth, listApps, listNodes } from "@/lib/control-plane";
import { BoxIcon, CloseIcon, GridIcon, PulseIcon, StackIcon } from "./icons";

const healthDot: Record<string, string> = {
  healthy: "var(--color-ok)",
  deploying: "var(--color-info)",
  degraded: "var(--color-warn)",
  down: "var(--color-bad)",
};

const nav = [
  { href: "/", label: "Dashboard", icon: GridIcon, exact: true },
  { href: "/apps", label: "Apps", icon: BoxIcon, exact: false },
  { href: "/nodes", label: "Nodes", icon: StackIcon, exact: true },
  { href: "/activity", label: "Activity", icon: PulseIcon, exact: true },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const apps = listApps();
  const counts: Record<string, number> = {
    "/apps": apps.length,
    "/nodes": listNodes().length,
  };

  return (
    <aside
      id="app-sidebar"
      aria-label="Control plane navigation"
      className={`rail drawer fixed inset-y-0 left-0 z-[var(--z-sticky)] flex w-[260px] flex-col gap-7 overflow-y-auto px-4 py-5 lg:translate-x-0 lg:visible ${
        open ? "translate-x-0 visible" : "-translate-x-full invisible"
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <Link href="/" className="flex items-center gap-3" onClick={onClose}>
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-well)] text-lg font-bold"
            style={{ background: "var(--color-lime)", color: "var(--color-ink)" }}
          >
            B
          </span>
          <span className="leading-tight">
            <span className="mono block text-base font-semibold tracking-tight">
              BYOV
            </span>
            <span className="rail-label block text-xs">Control plane</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="icon-btn h-10 w-10 lg:hidden"
        >
          <CloseIcon />
        </button>
      </div>

      <nav aria-label="Workspace" className="grid gap-1 px-1">
        <p className="rail-label px-2 pb-2">Workspace</p>
        {nav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const count = counts[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className="rail-link px-2 py-2 text-base font-medium"
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
              {count !== undefined && (
                <span
                  className="mono tnum ml-auto text-sm"
                  style={{ color: "var(--color-rail-muted)" }}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="App shortcuts" className="grid gap-1 px-1">
        <p className="rail-label px-2 pb-2">Apps</p>
        {apps.map((app) => {
          const active = pathname === `/apps/${app.slug}`;
          return (
            <Link
              key={app.slug}
              href={`/apps/${app.slug}`}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className="rail-link px-2 py-2 text-base"
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
      </nav>

      <div className="mt-auto px-1">
        <div className="rail-well flex items-center gap-3 p-3">
          <span
            aria-hidden="true"
            className="mono grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
            style={{ background: "var(--color-lime)", color: "var(--color-ink)" }}
          >
            MO
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Maya Okonkwo</span>
            <span className="rail-label block text-xs">Admin</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
