import type { NextRequest } from "next/server";
import { createApiApp, listApiApps } from "@/lib/api-apps";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";

/** Every app created over the API, oldest first. */
export async function GET(request: NextRequest) {
  const auth = await requireScope(request, "apps:read");
  if (auth instanceof Response) {
    return auth;
  }
  try {
    return apiOk(await listApiApps());
  } catch {
    return apiDbError();
  }
}

/**
 * Create an app: `{ name, slug?, description?, stack?, node }`. Blank
 * slugs derive from the name; every app starts with one Sandbox
 * environment on the chosen node.
 */
export async function POST(request: NextRequest) {
  const auth = await requireScope(request, "apps:write");
  if (auth instanceof Response) {
    return auth;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadJson();
  }
  const input = (body ?? {}) as {
    name?: unknown;
    slug?: unknown;
    description?: unknown;
    stack?: unknown;
    node?: unknown;
    repoUrl?: unknown;
    branch?: unknown;
  };
  let result;
  try {
    result = await createApiApp({
      name: input.name,
      slug: input.slug,
      description: input.description,
      stack: input.stack,
      node: input.node,
      repoUrl: input.repoUrl,
      branch: input.branch,
    });
  } catch {
    return apiDbError();
  }
  if (!result.ok) {
    return apiError(400, "The app could not be created.", {
      errors: result.errors,
    });
  }
  return apiOk(result.app, 201);
}
