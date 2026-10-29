"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DocsSection } from "@/lib/docs";

export function DocsNav({ sections }: { sections: DocsSection[] }) {
  const pathname = usePathname();
  const flat = sections.flatMap((section) => section.guides);

  return (
    <>
      <div
        className="fixed bottom-0 left-[216px] top-0 hidden w-[232px] flex-col gap-5 overflow-y-auto border-r px-3 py-5 lg:flex"
        style={{
          background: "var(--color-card)",
          borderColor: "var(--color-rule)",
        }}
      >
        <p className="rail-label px-2">Documentation</p>
        <div className="px-2">
          <p className="text-[15px] font-semibold tracking-tight">Guides</p>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-muted)" }}
          >
            Step-by-step runbooks for setting up and running BYOV.
          </p>
        </div>
        {sections.map((section) => (
          <nav
            key={section.id}
            aria-label={section.title}
            className="grid gap-0.5"
          >
            <p className="rail-label px-2 pb-1">{section.title}</p>
            {section.guides.map((guide) => {
              const active = pathname === guide.href;
              return (
                <Link
                  key={guide.href}
                  href={guide.href}
                  aria-current={active || undefined}
                  className="subnav-link px-2 py-1.5 text-sm"
                >
                  {guide.label}
                </Link>
              );
            })}
          </nav>
        ))}
      </div>
      <nav
        aria-label="Documentation"
        className="flex gap-2 overflow-x-auto pb-2 lg:hidden"
      >
        {flat.map((guide) => {
          const active = pathname === guide.href;
          return (
            <Link
              key={guide.href}
              href={guide.href}
              aria-current={active || undefined}
              className="btn-ghost shrink-0 px-3 py-1.5 text-[13px]"
              style={
                active
                  ? { borderColor: "var(--color-accent-deep)" }
                  : undefined
              }
            >
              {guide.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
