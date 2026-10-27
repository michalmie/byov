"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/nodes", label: "Nodes" },
];

export function SettingsSubnav() {
  const pathname = usePathname();

  return (
    <>
      <div
        className="fixed bottom-0 left-[260px] top-0 hidden w-[248px] flex-col gap-6 overflow-y-auto border-r px-5 pb-8 pt-10 lg:flex"
        style={{
          background: "var(--color-paper)",
          borderColor: "var(--color-rule)",
        }}
      >
        <div>
          <p className="text-base font-semibold tracking-tight">Settings</p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Workspace preferences and the nodes apps deploy to.
          </p>
        </div>
        <nav aria-label="Settings sections" className="grid gap-1">
          {sections.map((section) => {
            const active = pathname === section.href;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active || undefined}
                className="subnav-link px-3 py-2 text-sm"
              >
                {section.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <nav
        aria-label="Settings sections"
        className="flex gap-2 overflow-x-auto pb-2 lg:hidden"
      >
        {sections.map((section) => {
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active || undefined}
              className="btn-ghost shrink-0 px-3 py-1.5 text-sm"
              style={
                active
                  ? { borderColor: "var(--color-accent-deep)" }
                  : undefined
              }
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
