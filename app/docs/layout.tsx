import type { Metadata } from "next";
import { DocsShell } from "@/components/docs-shell";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "BYOV documentation — step-by-step guides for setting up and running the control plane.",
};

export default function DocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DocsShell>{children}</DocsShell>;
}
