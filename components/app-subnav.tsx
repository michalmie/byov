"use client";

import { useEffect, useState } from "react";
import type { AppSection, Health } from "@/lib/control-plane";
import { HealthPill } from "./data-ui";
import {
  DeployIcon,
  DocIcon,
  ShieldCheckIcon,
  StackIcon,
} from "./icons";

const sectionIcon: Record<string, typeof DocIcon> = {
  overview: DocIcon,
  environments: StackIcon,
  deployments: DeployIcon,
  checks: ShieldCheckIcon,
};

export function AppSubnav({
  name,
  slug,
  stack,
  health,
  sections,
}: {
  name: string;
  slug: string;
  stack: string;
  health: Health;
  sections: AppSection[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "overview");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) {
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      <div
        className="fixed bottom-0 left-[216px] top-0 hidden w-[232px] flex-col gap-5 overflow-y-auto border-r px-3 py-5 lg:flex"
        style={{
          background: "var(--color-card)",
          borderColor: "var(--color-rule)",
        }}
      >
        <p className="rail-label px-2">App</p>
        <div className="px-2">
          <p className="truncate text-[15px] font-semibold tracking-tight">
            {name}
          </p>
          <div className="mt-2">
            <HealthPill health={health} />
          </div>
          <p
            className="mono mt-2 truncate text-xs"
            style={{ color: "var(--color-muted)" }}
          >
            {slug} · {stack}
          </p>
        </div>
        <nav aria-label="App sections" className="grid gap-0.5">
          {sections.map((section) => {
            const Icon = sectionIcon[section.id] ?? DocIcon;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                aria-current={active === section.id || undefined}
                className="subnav-link px-2 py-1.5 text-sm"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {section.label}
              </a>
            );
          })}
        </nav>
      </div>
      <nav
        aria-label="App sections"
        className="flex gap-2 overflow-x-auto pb-2 lg:hidden"
      >
        {sections.map((section) => {
          const isActive = active === section.id;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={isActive || undefined}
              className="btn-ghost shrink-0 px-3 py-1.5 text-[13px]"
              style={
                isActive
                  ? { borderColor: "var(--color-accent-deep)" }
                  : undefined
              }
            >
              {section.label}
            </a>
          );
        })}
      </nav>
    </>
  );
}
