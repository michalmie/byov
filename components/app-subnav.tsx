"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppSection, Health } from "@/lib/control-plane";
import { HealthPill } from "./data-ui";
import { ArrowLeftIcon } from "./icons";

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
        className="fixed bottom-0 left-[260px] top-0 hidden w-[248px] flex-col gap-6 overflow-y-auto border-r px-5 pb-8 pt-10 lg:flex"
        style={{
          background: "var(--color-paper)",
          borderColor: "var(--color-rule)",
        }}
      >
        <Link
          href="/apps"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--color-ink-2)" }}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          All apps
        </Link>
        <div>
          <p className="truncate text-base font-semibold tracking-tight">
            {name}
          </p>
          <div className="mt-2">
            <HealthPill health={health} />
          </div>
          <p
            className="mono mt-2 truncate text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            {slug} · {stack}
          </p>
        </div>
        <nav aria-label="App sections" className="grid gap-1">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={active === section.id || undefined}
              className="subnav-link px-3 py-2 text-sm"
            >
              {section.label}
            </a>
          ))}
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
              className="btn-ghost shrink-0 px-3 py-1.5 text-sm"
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
