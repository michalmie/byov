import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticle } from "@/components/docs-article";
import {
  OAUTH_PROVIDERS,
  getAdjacentGuides,
  getGuideBySlug,
  loadGuide,
} from "@/lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return OAUTH_PROVIDERS.map((provider) => ({ provider }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider } = await params;
  const meta = getGuideBySlug(["oauth", provider]);
  if (!meta) {
    return { title: "Unknown guide" };
  }
  const doc = loadGuide(meta);
  return { title: doc.title, description: doc.description };
}

export default async function OAuthProviderGuide({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;
  const meta = getGuideBySlug(["oauth", provider]);
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
