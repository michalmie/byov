import { DOCS_SECTIONS } from "@/lib/docs";
import { DocsNav } from "./docs-nav";
import { ControlPlaneShell } from "./shell";

export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <ControlPlaneShell crumb="Docs" subnav={<DocsNav sections={DOCS_SECTIONS} />}>
      {children}
    </ControlPlaneShell>
  );
}
