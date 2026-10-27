import type { Metadata } from "next";
import { StackDetailView } from "@/components/stack-detail";
import { getStack, listStacks } from "@/lib/stacks";

export function generateStaticParams() {
  return listStacks().map((stack) => ({ slug: stack.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stack = getStack(slug);
  return { title: stack ? stack.name : "Unknown stack" };
}

export default async function StackDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StackDetailView slug={slug} />;
}
