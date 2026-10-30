import {
  DOCS_SECTIONS,
  OAUTH_PROVIDERS,
  buildGuide,
  getAdjacentGuides,
  getGuideBySlug,
  isOAuthProvider,
  loadGuide,
  parseFrontmatter,
  renderInline,
  renderMarkdown,
  slugifyHeading,
} from "@/lib/docs";

describe("docs registry", () => {
  it("covers the overview plus one guide per OAuth provider", () => {
    expect(OAUTH_PROVIDERS).toEqual(["entra", "github", "google", "apple"]);
    const hrefs = DOCS_SECTIONS.flatMap((section) =>
      section.guides.map((guide) => guide.href),
    );
    expect(hrefs).toEqual([
      "/docs/oauth",
      "/docs/oauth/entra",
      "/docs/oauth/github",
      "/docs/oauth/google",
      "/docs/oauth/apple",
      "/docs/agents-prompt",
    ]);
  });

  it("maps files to the sibling markdown contract", () => {
    const files = DOCS_SECTIONS.flatMap((section) =>
      section.guides.map((guide) => guide.file),
    );
    expect(files).toEqual([
      "docs/oauth/README.md",
      "docs/oauth/entra.md",
      "docs/oauth/github.md",
      "docs/oauth/google.md",
      "docs/oauth/apple.md",
      "docs/agents-prompt.md",
    ]);
  });

  it("resolves guides by slug and rejects unknown slugs", () => {
    expect(getGuideBySlug(["oauth", "github"])?.href).toBe(
      "/docs/oauth/github",
    );
    expect(getGuideBySlug(["agents-prompt"])?.href).toBe(
      "/docs/agents-prompt",
    );
    expect(getGuideBySlug(["oauth", "okta"])).toBeNull();
  });

  it("validates OAuth provider params", () => {
    expect(isOAuthProvider("entra")).toBe(true);
    expect(isOAuthProvider("okta")).toBe(false);
  });

  it("walks prev/next across the guide order", () => {
    const { prev, next } = getAdjacentGuides("/docs/oauth/github");
    expect(prev?.href).toBe("/docs/oauth/entra");
    expect(next?.href).toBe("/docs/oauth/google");
    expect(getAdjacentGuides("/docs/oauth").prev).toBeNull();
    expect(getAdjacentGuides("/docs/oauth/apple").next?.href).toBe(
      "/docs/agents-prompt",
    );
    expect(getAdjacentGuides("/docs/agents-prompt").prev?.href).toBe(
      "/docs/oauth/apple",
    );
    expect(getAdjacentGuides("/docs/agents-prompt").next).toBeNull();
  });

  it("loads the agents-prompt guide from disk", () => {
    const meta = getGuideBySlug(["agents-prompt"])!;
    const doc = loadGuide(meta);
    expect(doc.missing).toBe(false);
    expect(doc.title).toBe("Per-app AGENTS.md prompt");
    expect(doc.html).toContain('<h2 id="what-it-is">What it is</h2>');
  });
});

describe("parseFrontmatter", () => {
  it("reads title and description", () => {
    const { data, body } = parseFrontmatter(
      '---\ntitle: "GitHub setup"\ndescription: Sign in with GitHub\n---\n\nBody here.\n',
    );
    expect(data).toEqual({
      title: "GitHub setup",
      description: "Sign in with GitHub",
    });
    expect(body).toBe("Body here.\n");
  });

  it("passes through documents without frontmatter", () => {
    const { data, body } = parseFrontmatter("# Hello\n");
    expect(data).toEqual({});
    expect(body).toBe("# Hello\n");
  });
});

describe("renderInline", () => {
  it("renders code, bold, italic and links", () => {
    expect(renderInline("`AUTH_X` and **bold** and *italic*")).toBe(
      "<code>AUTH_X</code> and <strong>bold</strong> and <em>italic</em>",
    );
    expect(renderInline("[BYOV](/docs)")).toBe('<a href="/docs">BYOV</a>');
  });

  it("leaves underscored identifiers alone", () => {
    expect(renderInline("set AUTH_ENTRA_TENANT_ID first")).toBe(
      "set AUTH_ENTRA_TENANT_ID first",
    );
  });

  it("escapes raw HTML and drops unsafe link targets", () => {
    expect(renderInline("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(renderInline("[click](javascript:alert(1))")).toBe("click");
  });
});

describe("renderMarkdown", () => {
  it("renders headings with stable anchor ids", () => {
    const { html, headings } = renderMarkdown("## Verify it works\n");
    expect(html).toBe('<h2 id="verify-it-works">Verify it works</h2>');
    expect(headings).toEqual([
      { id: "verify-it-works", text: "Verify it works", level: 2 },
    ]);
  });

  it("dedupes repeated heading ids", () => {
    const { html } = renderMarkdown("## Setup\n\n## Setup\n");
    expect(html).toContain('<h2 id="setup">Setup</h2>');
    expect(html).toContain('<h2 id="setup-2">Setup</h2>');
  });

  it("renders fenced code without interpreting it", () => {
    const { html } = renderMarkdown('```bash\necho "<b>"\n```\n');
    expect(html).toBe(
      '<pre><code class="language-bash">echo &quot;&lt;b&gt;&quot;</code></pre>',
    );
  });

  it("renders nested lists and block content inside items", () => {
    const { html } = renderMarkdown(
      "1. Register the app\n   ```bash\n   echo hi\n   ```\n2. Copy the secret\n   - keep it safe\n   - rotate yearly\n",
    );
    expect(html).toContain("<ol>");
    expect(html).toContain(
      '<pre><code class="language-bash">echo hi</code></pre>',
    );
    expect(html).toContain("<ul>");
  });

  it("renders blockquotes and rules", () => {
    const { html } = renderMarkdown("> Keep secrets out of git.\n\n---\n");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("Keep secrets out of git.");
    expect(html).toContain("<hr />");
  });

  it("renders tables with alignment", () => {
    const { html } = renderMarkdown(
      "| Name | Value |\n| ---- | ----: |\n| `A` | 1 |\n",
    );
    expect(html).toContain("<table>");
    expect(html).toContain('<th scope="col">Name</th>');
    expect(html).toContain('<td align="right">1</td>');
    expect(html).toContain("<code>A</code>");
  });
});

describe("slugifyHeading", () => {
  it("strips inline markdown before slugging", () => {
    expect(slugifyHeading("Verify `AUTH_X` works")).toBe("verify-auth-x-works");
  });
});

describe("buildGuide", () => {
  const meta = getGuideBySlug(["oauth", "github"])!;

  it("uses frontmatter and folds the H1 into the title", () => {
    const doc = buildGuide(
      meta,
      '---\ntitle: GitHub setup\ndescription: Sign in with GitHub\n---\n# Ignored H1\n\n## Step one\n',
    );
    expect(doc.title).toBe("GitHub setup");
    expect(doc.description).toBe("Sign in with GitHub");
    expect(doc.missing).toBe(false);
    expect(doc.html).not.toContain("Ignored H1");
    expect(doc.html).toContain('<h2 id="step-one">Step one</h2>');
  });

  it("falls back to the registry when frontmatter is absent", () => {
    const doc = buildGuide(meta, "# GitHub guide\n\nText.\n");
    expect(doc.title).toBe("GitHub guide");
    expect(doc.description).toBe(meta.description);
    expect(doc.html).toContain("<p>Text.</p>");
  });

  it("renders a placeholder when the file is absent", () => {
    const doc = buildGuide(meta, null);
    expect(doc.missing).toBe(true);
    expect(doc.title).toBe(meta.label);
    expect(doc.headings).toEqual([]);
    expect(doc.html).toContain("on its way");
  });
});
