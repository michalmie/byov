import type { Metadata } from "next";
import { TemplateDetailView } from "@/components/template-detail";
import { getTemplate, listTemplates } from "@/lib/templates";

export function generateStaticParams() {
  return listTemplates().map((template) => ({ slug: template.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const template = getTemplate(slug);
  return { title: template ? template.name : "Unknown template" };
}

export default async function TemplateDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TemplateDetailView slug={slug} />;
}
