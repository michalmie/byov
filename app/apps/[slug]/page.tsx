import type { Metadata } from "next";
import { AppDetailView } from "@/components/app-detail";
import { getApp, listApps } from "@/lib/control-plane";

export function generateStaticParams() {
  return listApps().map((app) => ({ slug: app.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = getApp(slug);
  return { title: app ? app.name : "Unknown app" };
}

export default async function AppDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AppDetailView slug={slug} />;
}
