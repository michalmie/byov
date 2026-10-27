"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DocIcon, GlobeIcon, StackIcon } from "./icons";

const sections = [
  { href: "/settings/general", label: "General", icon: DocIcon },
  { href: "/settings/nodes", label: "Nodes", icon: StackIcon },
  { href: "/settings/dns", label: "DNS", icon: GlobeIcon },
];

export function SettingsSubnav() {
  const pathname = usePathname();

  return (
    <>
      <div
        className="fixed bottom-0 left-[216px] top-0 hidden w-[232px] flex-col gap-5 overflow-y-auto border-r px-3 py-5 lg:flex"
        style={{
          background: "var(--color-card)",
          borderColor: "var(--color-rule)",
        }}
      >
        <p className="rail-label px-2">Settings</p>
        <div className="px-2">
          <p className="text-[15px] font-semibold tracking-tight">Workspace</p>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-muted)" }}
          >
            Preferences and the nodes apps deploy to.
          </p>
        </div>
        <nav aria-label="Settings sections" className="grid gap-0.5">
          {sections.map((section) => {
            const active = pathname === section.href;
            const Icon = section.icon;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active || undefined}
                className="subnav-link px-2 py-1.5 text-sm"
              >
                <Icon className="h-4 w-4 shrink-0" />
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
              className="btn-ghost shrink-0 px-3 py-1.5 text-[13px]"
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
