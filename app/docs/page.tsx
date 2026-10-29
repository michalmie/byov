import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { DOCS_SECTIONS, loadGuide } from "@/lib/docs";

export default function DocsIndex() {
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Documentation</h1>
        <p
          className="mt-2 max-w-[65ch] text-sm"
          style={{ color: "var(--color-muted)" }}
        >
          Step-by-step guides for setting up and running BYOV. Start with
          OAuth sign-in to connect your team&apos;s identity provider.
        </p>
      </div>

      {DOCS_SECTIONS.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`docs-section-${section.id}`}
          className="card overflow-hidden"
        >
          <div
            className="border-b px-5 py-4"
            style={{ borderColor: "var(--color-rule)" }}
          >
            <h2
              id={`docs-section-${section.id}`}
              className="text-[15px] font-semibold tracking-tight"
            >
              {section.title}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-ink-2)" }}>
              {section.description}
            </p>
          </div>
          <ul className="divide-y divide-[var(--color-rule-2)]">
            {section.guides.map((guide) => {
              const doc = loadGuide(guide);
              return (
                <li key={guide.href}>
                  <Link
                    href={guide.href}
                    className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[var(--color-paper)]"
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {doc.title}
                      </span>
                      <span
                        className="truncate text-[13px]"
                        style={{ color: "var(--color-muted)" }}
                      >
                        {doc.description}
                      </span>
                    </span>
                    {doc.missing && (
                      <span
                        className="tag shrink-0 border px-2 py-0.5"
                        style={{
                          background: "var(--color-warn-soft)",
                          borderColor: "var(--color-rule)",
                          color: "var(--color-warn-deep)",
                        }}
                      >
                        Coming soon
                      </span>
                    )}
                    <ArrowRightIcon className="h-4 w-4 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
