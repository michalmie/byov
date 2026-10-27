// App template catalog. Each stack ships a manifest under
// templates/<slug>/; this module exposes the typed registry the UI
// and tests read. Adding a stack = new folder + manifest + entry here.
import byovStackManifest from "@/templates/byov-stack/manifest.json";

export type TemplateStatus = "draft" | "stable" | "deprecated";

export interface TemplateStackItem {
  label: string;
  value: string;
}

export interface TemplateCheck {
  name: string;
  command: string;
  cadence: string;
}

export interface TemplateScaffoldStep {
  title: string;
  detail: string;
  command?: string;
}

export interface TemplateStarter {
  kind: string;
  ref: string;
  note: string;
}

export interface AppTemplate {
  slug: string;
  name: string;
  tagline: string;
  status: TemplateStatus;
  stack: TemplateStackItem[];
  packages: Record<string, string>;
  scripts: Record<string, string>;
  checks: TemplateCheck[];
  nodes: string[];
  scaffold: TemplateScaffoldStep[];
  starter: TemplateStarter;
  docs: string[];
}

const templates: AppTemplate[] = [byovStackManifest as AppTemplate];

export function listTemplates(): AppTemplate[] {
  return templates;
}

export function getTemplate(slug: string): AppTemplate | undefined {
  return templates.find((template) => template.slug === slug);
}
