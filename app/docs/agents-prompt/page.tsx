import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticle } from "@/components/docs-article";
import { getAdjacentGuides, getGuideBySlug, loadGuide } from "@/lib/docs";

const SLUG = ["agents-prompt"];

export function generateMetadata(): Metadata {
  const meta = getGuideBySlug(SLUG);
  if (!meta) {
    return { title: "Agents prompt" };
  }
  const doc = loadGuide(meta);
  return { title: doc.title, description: doc.description };
}

export default function AgentsPromptGuide() {
  const meta = getGuideBySlug(SLUG);
  if (!meta) {
    notFound();
  }
  const doc = loadGuide(meta);
  const { prev, next } = getAdjacentGuides(meta.href);
  return (
    <DocsArticle
      title={doc.title}
      description={doc.description}
      html={doc.html}
      headings={doc.headings}
      prev={prev}
      next={next}
      missing={doc.missing}
    />
  );
}
