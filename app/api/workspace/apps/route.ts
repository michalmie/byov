import type { NextRequest } from "next/server";
import {
  createWorkspaceApp,
  listWorkspaceApps,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { AppDraft } from "@/lib/apps";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceSession,
} from "../_lib";

function asDraft(body: Record<string, unknown>): AppDraft {
  const text = (value: unknown): string =>
    typeof value === "string" ? value : "";
  return {
    name: text(body.name),
    slug: text(body.slug),
    description: text(body.description),
    stack: text(body.stack),
    node: text(body.node),
  };
}

/** Every workspace app, oldest slug first. Samples stay UI-side. */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  return apiOk(await listWorkspaceApps());
}

/**
 * Create an app: `{ name, slug?, description?, stack?, node }`. Blank
 * slugs derive from the name; every app starts with one Sandbox
 * environment on the chosen node.
 */
export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await createWorkspaceApp(asDraft(body));
  if (!result.ok) {
    return apiError(400, "The app could not be created.", {
      errors: result.errors,
    });
  }
  return apiOk(result.app, 201);
}
