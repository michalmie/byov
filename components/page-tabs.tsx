"use client";

import { useEffect, useState } from "react";
import type { AppSection } from "@/lib/control-plane";
import {
  DeployIcon,
  DocIcon,
  ShieldCheckIcon,
  StackIcon,
} from "./icons";

/** Icons for the known page-section ids; unknown ids render without one. */
export const sectionIcons: Record<string, typeof DocIcon> = {
  overview: DocIcon,
  environments: StackIcon,
  deployments: DeployIcon,
  checks: ShieldCheckIcon,
};

/**
 * Third-level navigation: an in-content tab bar over the page's anchor
 * sections. Sticky under the topbar; the active tab follows scrolling
 * (same anchors as the app rail).
 */
export function PageTabs({
  sections,
  label = "Page sections",
}: {
  sections: AppSection[];
  label?: string;
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
    <nav
      aria-label={label}
      className="page-tabs sticky top-[52px] z-[var(--z-raised)] flex gap-5 overflow-x-auto"
    >
      {sections.map((section) => {
        const Icon = sectionIcons[section.id];
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active === section.id || undefined}
            className="page-tab"
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            {section.label}
          </a>
        );
      })}
    </nav>
  );
}
