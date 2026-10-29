/**
 * In-app docs registry plus a tiny server-side Markdown renderer.
 *
 * Guides live as Markdown under `docs/` and are rendered with zero new
 * dependencies. The renderer covers the subset the guides use: headings,
 * paragraphs, fenced code, ordered/unordered lists (nested, with block
 * content inside items), blockquotes, tables, rules, and inline code,
 * bold, italic, strikethrough and links. Raw HTML in the source is
 * escaped, never rendered, and link targets are allow-listed so the
 * resulting HTML is safe for `dangerouslySetInnerHTML`.
 *
 * Node-only: `loadGuide` reads from disk, so this module must stay out
 * of client components (import the types only).
 */
import fs from "node:fs";
import path from "node:path";

export interface DocsGuideMeta {
  /** Route segments under /docs, e.g. ["oauth", "github"]. */
  slug: string[];
  /** Full href, e.g. "/docs/oauth/github". */
  href: string;
  /** Repo-relative path of the Markdown source. */
  file: string;
  /** Title used when the file (or its frontmatter) has none. */
  label: string;
  /** Description used when the file (or its frontmatter) has none. */
  description: string;
}

export interface DocsSection {
  id: string;
  title: string;
  description: string;
  guides: DocsGuideMeta[];
}

export interface DocsHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface ParsedDoc {
  title: string;
  description: string;
  html: string;
  headings: DocsHeading[];
  /** True when the Markdown file is absent; `html` is a placeholder. */
  missing: boolean;
}

export const OAUTH_PROVIDERS = ["entra", "github", "google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

const OAUTH_FILE: Record<OAuthProvider, { label: string; description: string }> = {
  entra: {
    label: "Microsoft Entra ID",
    description:
      "Register BYOV as an Entra app registration and sign in with a Microsoft work or school account.",
  },
  github: {
    label: "GitHub",
    description:
      "Create a GitHub OAuth App and let developers sign in with their GitHub account.",
  },
  google: {
    label: "Google",
    description:
      "Configure a Google Cloud OAuth client and sign in with a Google account.",
  },
  apple: {
    label: "Apple",
    description:
      "Set up Sign in with Apple with a Services ID and private key.",
  },
};

function oauthGuide(provider: OAuthProvider): DocsGuideMeta {
  return {
    slug: ["oauth", provider],
    href: `/docs/oauth/${provider}`,
    file: `docs/oauth/${provider}.md`,
    label: OAUTH_FILE[provider].label,
    description: OAUTH_FILE[provider].description,
  };
}

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: "oauth",
    title: "OAuth sign-in",
    description:
      "Connect BYOV to an external identity provider so your team can sign in with accounts they already have.",
    guides: [
      {
        slug: ["oauth"],
        href: "/docs/oauth",
        file: "docs/oauth/README.md",
        label: "OAuth overview",
        description:
          "How OAuth sign-in works in BYOV, which providers are supported, and how to pick one.",
      },
      oauthGuide("entra"),
      oauthGuide("github"),
      oauthGuide("google"),
      oauthGuide("apple"),
    ],
  },
];

export function allGuides(): DocsGuideMeta[] {
  return DOCS_SECTIONS.flatMap((section) => section.guides);
}

export function getGuideBySlug(slug: string[]): DocsGuideMeta | null {
  const href = `/docs/${slug.join("/")}`;
  return allGuides().find((guide) => guide.href === href) ?? null;
}

export function getAdjacentGuides(href: string): {
  prev: DocsGuideMeta | null;
  next: DocsGuideMeta | null;
} {
  const guides = allGuides();
  const index = guides.findIndex((guide) => guide.href === href);
  if (index === -1) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? guides[index - 1] : null,
    next: index < guides.length - 1 ? guides[index + 1] : null,
  };
}

/* ————— Frontmatter ————— */

export function parseFrontmatter(source: string): {
  data: Record<string, string>;
  body: string;
} {
  const data: Record<string, string> = {};
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { data, body: source };
  }
  const end = source.indexOf("\n---", 3);
  if (end === -1) {
    return { data, body: source };
  }
  const raw = source.slice(3, end).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }
    data[match[1].toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  const body = source
    .slice(end + 4)
    .replace(/^\r?\n/, "")
    .replace(/^\r?\n/, "");
  return { data, body };
}

/* ————— Inline rendering ————— */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text version of an inline Markdown span (for heading ids/TOC). */
export function stripInline(text: string): string {
  return text
    .replace(/(`+)([^`]*?)\1/g, "$2")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|~~)(.+?)\1/g, "$2")
    .trim();
}

export function slugifyHeading(text: string): string {
  return stripInline(text)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSafeLinkTarget(target: string): boolean {
  return (
    target.startsWith("#") ||
    target.startsWith("/") ||
    target.startsWith("https://") ||
    target.startsWith("http://") ||
    target.startsWith("mailto:")
  );
}

/**
 * Render inline Markdown. Underscore emphasis is deliberately NOT
 * supported: identifiers like AUTH_ENTRA_TENANT_ID would be mangled by
 * it, and the guides mark code with backticks instead.
 */
export function renderInline(text: string): string {
  const codes: string[] = [];
  const withoutCode = text.replace(/(`+)([^`]*?)\1/g, (_match, _ticks, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  let out = escapeHtml(withoutCode);
  // Link targets allow one level of balanced parens (e.g. Wikipedia URLs).
  const target = "((?:[^()\\s]|\\([^)]*\\))+)";
  out = out.replace(
    new RegExp(`!\\[([^\\]]*)\\]\\(${target}(?:\\s+"[^"]*")?\\)`, "g"),
    (_match, alt, src) =>
      isSafeLinkTarget(src)
        ? `<img src="${src}" alt="${alt}" loading="lazy" />`
        : escapeHtml(String(alt)),
  );
  out = out.replace(
    new RegExp(`\\[([^\\]]+)\\]\\(${target}(?:\\s+"[^"]*")?\\)`, "g"),
    (_match, label, linkTarget) =>
      isSafeLinkTarget(linkTarget)
        ? `<a href="${linkTarget}">${label}</a>`
        : label,
  );
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  out = out.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  out = out.replace(/\u0000(\d+)\u0000/g, (_match, index) => codes[Number(index)]);
  return out;
}

/* ————— Block rendering ————— */

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s*(---|\*\*\*|___)\s*$/;
const QUOTE_RE = /^\s*>/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_DELIMITER_RE = /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/;

function isBlockStart(line: string): boolean {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    LIST_RE.test(line)
  );
}

function splitTableRow(line: string): string[] {
  let cells = line.trim();
  if (cells.startsWith("|")) {
    cells = cells.slice(1);
  }
  if (cells.endsWith("|")) {
    cells = cells.slice(0, -1);
  }
  return cells.split("|").map((cell) => cell.trim());
}

interface RenderState {
  headings: DocsHeading[];
  usedIds: Set<string>;
}

function headingId(state: RenderState, text: string): string {
  const base = slugifyHeading(text) || "section";
  let id = base;
  let suffix = 2;
  while (state.usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  state.usedIds.add(id);
  return id;
}

function renderTable(header: string[], delimiter: string[], rows: string[][]): string {
  const aligns = delimiter.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) {
      return "center";
    }
    if (right) {
      return "right";
    }
    return "left";
  });
  const alignAttr = (index: number) =>
    aligns[index] && aligns[index] !== "left" ? ` align="${aligns[index]}"` : "";
  const head = header
    .map((cell, index) => `<th scope="col"${alignAttr(index)}>${renderInline(cell)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => `<td${alignAttr(index)}>${renderInline(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderListItems(
  state: RenderState,
  ordered: boolean,
  items: string[][],
): string {
  const tag = ordered ? "ol" : "ul";
  const rendered = items
    .map((lines) => `<li>${renderBlockLines(state, lines).join("\n")}</li>`)
    .join("\n");
  return `<${tag}>\n${rendered}\n</${tag}>`;
}

function renderBlockLines(state: RenderState, lines: string[]): string[] {
  const html: string[] = [];
  let i = 0;
  const isBlank = (line: string) => /^\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[2][0];
      const lang = fence[3];
      const close = new RegExp(`^\\s*\\${marker}{3,}\\s*$`);
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !close.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // Consume the closing fence (or EOF).
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      html.push(`<pre><code${langAttr}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      const id = headingId(state, heading[2]);
      if (level === 2 || level === 3) {
        state.headings.push({ id, text: stripInline(heading[2]), level });
      }
      html.push(`<h${level} id="${id}">${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      html.push("<hr />");
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote>\n${renderBlockLines(state, quote).join("\n")}\n</blockquote>`);
      continue;
    }

    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      TABLE_DELIMITER_RE.test(lines[i + 1]) &&
      lines[i + 1].includes("-") &&
      !isBlockStart(line)
    ) {
      const header = splitTableRow(line);
      const delimiter = splitTableRow(lines[i + 1]);
      if (
        delimiter.length === header.length &&
        delimiter.every((cell) => /^:?-+:?$/.test(cell))
      ) {
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
          const row = splitTableRow(lines[i]);
          while (row.length < header.length) {
            row.push("");
          }
          rows.push(row.slice(0, header.length));
          i += 1;
        }
        html.push(renderTable(header, delimiter, rows));
        continue;
      }
    }

    const listMatch = line.match(LIST_RE);
    if (listMatch) {
      const baseIndent = listMatch[1].length;
      const ordered = /\d/.test(listMatch[2]);
      const items: string[][] = [];
      let markerWidth = 0;
      while (i < lines.length) {
        const current = lines[i];
        if (isBlank(current)) {
          i += 1;
          continue;
        }
        const item = current.match(LIST_RE);
        if (
          item &&
          item[1].length === baseIndent &&
          ordered === /\d/.test(item[2])
        ) {
          markerWidth = item[2].length + 1;
          items.push([item[3]]);
          i += 1;
          continue;
        }
        if (item && item[1].length < baseIndent) {
          break;
        }
        const indent = current.match(/^\s*/)?.[0].length ?? 0;
        if (items.length > 0 && indent > baseIndent) {
          const dedent = Math.min(indent, baseIndent + markerWidth);
          items[items.length - 1].push(current.slice(dedent));
          i += 1;
          continue;
        }
        break;
      }
      html.push(renderListItems(state, ordered, items));
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !isBlockStart(lines[i]) &&
      !(lines[i].includes("|") && TABLE_DELIMITER_RE.test(lines[i + 1] ?? ""))
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    const rendered = paragraph
      .map((text, index) => {
        const hardBreak = index < paragraph.length - 1 && / {2,}$/.test(text);
        return renderInline(text.replace(/\s+$/, "")) + (hardBreak ? "<br />" : "");
      })
      .join("\n");
    html.push(`<p>${rendered}</p>`);
  }

  return html;
}

export function renderMarkdown(markdown: string): {
  html: string;
  headings: DocsHeading[];
} {
  const state: RenderState = { headings: [], usedIds: new Set() };
  const html = renderBlockLines(state, markdown.split(/\r?\n/)).join("\n");
  return { html, headings: state.headings };
}

/* ————— Loading ————— */

export function resolveGuideFile(meta: DocsGuideMeta): string {
  return path.join(process.cwd(), meta.file);
}

function readGuideFile(meta: DocsGuideMeta): string | null {
  try {
    return fs.readFileSync(resolveGuideFile(meta), "utf8");
  } catch {
    return null;
  }
}

const PLACEHOLDER_HTML =
  "<p>This guide is on its way — the setup content has not landed in this workspace yet. Check back after the next update, or ask your administrator if you need the steps sooner.</p>";

/**
 * Build the rendered guide from Markdown source. A `null` source (file
 * absent) yields a placeholder article so the docs area still builds and
 * the guide appears as soon as its file lands.
 */
export function buildGuide(meta: DocsGuideMeta, source: string | null): ParsedDoc {
  if (source === null) {
    return {
      title: meta.label,
      description: meta.description,
      html: PLACEHOLDER_HTML,
      headings: [],
      missing: true,
    };
  }
  const { data, body } = parseFrontmatter(source);
  let markdown = body;
  let title = data.title || meta.label;
  // Guides start with an H1 that duplicates the article header; fold it
  // into the page title instead of rendering it twice.
  const h1 = markdown.match(/^\s*#\s+(.+?)\s*\r?\n/);
  if (h1) {
    if (!data.title) {
      title = stripInline(h1[1]);
    }
    markdown = markdown.slice(h1[0].length);
  }
  const { html, headings } = renderMarkdown(markdown);
  return {
    title,
    description: data.description || meta.description,
    html,
    headings,
    missing: false,
  };
}

export function loadGuide(meta: DocsGuideMeta): ParsedDoc {
  return buildGuide(meta, readGuideFile(meta));
}
