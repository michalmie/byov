import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";
import type { DocsGuideMeta, DocsHeading } from "@/lib/docs";
import styles from "./docs-article.module.css";

export function DocsArticle({
  title,
  description,
  html,
  headings,
  prev,
  next,
  missing,
}: {
  title: string;
  description: string;
  html: string;
  headings: DocsHeading[];
  prev: DocsGuideMeta | null;
  next: DocsGuideMeta | null;
  missing: boolean;
}) {
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <article className="min-w-0">
        <header>
          {missing && (
            <p className="mb-3">
              <span
                className="tag border px-2 py-1"
                style={{
                  background: "var(--color-warn-soft)",
                  borderColor: "var(--color-rule)",
                  color: "var(--color-warn-deep)",
                }}
              >
                Coming soon
              </span>
            </p>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            {description}
          </p>
        </header>
        <div
          className={styles.body}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <nav
          aria-label="Guide pages"
          className="rule-top mt-10 grid gap-3 pt-6 sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={prev.href}
              className="btn-ghost items-start px-3 py-2.5 text-left text-[13px]"
            >
              <ArrowLeftIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="grid gap-0.5">
                <span style={{ color: "var(--color-muted)" }}>Previous</span>
                <span className="font-medium">{prev.label}</span>
              </span>
            </Link>
          ) : (
            <span aria-hidden="true" className="hidden sm:block" />
          )}
          {next && (
            <Link
              href={next.href}
              className="btn-ghost items-start justify-end px-3 py-2.5 text-right text-[13px]"
            >
              <span className="grid gap-0.5">
                <span style={{ color: "var(--color-muted)" }}>Next</span>
                <span className="font-medium">{next.label}</span>
              </span>
              <ArrowRightIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            </Link>
          )}
        </nav>
      </article>
      {headings.length > 0 && (
        <aside className="hidden xl:block">
          <nav
            aria-label="On this page"
            className="sticky top-[68px] max-h-[calc(100dvh-88px)] overflow-y-auto"
          >
            <p className="rail-label pb-2">On this page</p>
            <ul className="grid gap-1 border-l pl-3" style={{ borderColor: "var(--color-rule)" }}>
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a
                    href={`#${heading.id}`}
                    className="block py-0.5 text-[13px] leading-snug"
                    style={{
                      color: "var(--color-muted)",
                      marginLeft: heading.level === 3 ? "0.75rem" : 0,
                    }}
                  >
                    {heading.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}
