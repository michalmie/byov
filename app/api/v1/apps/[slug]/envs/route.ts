import type { NextRequest } from "next/server";
import { addApiEnv, findApp } from "@/lib/api-apps";
import { requireApiAuth } from "@/lib/api-auth";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";

/** Every environment of one API-created app. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireApiAuth(request);
  if (auth instanceof Response) {
    return auth;
  }
  const { slug } = await context.params;
  const app = findApp(slug);
  if (!app) {
    return apiError(404, `No app found for slug "${slug}".`);
  }
  return apiOk(app.envs);
}

/**
 * Add an environment: `{ name, node, url? }`. New envs start Pending
 * until the first deploy; `url` is an explicit override (blank resolves
 * through the dev-URL contract).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireApiAuth(request);
  if (auth instanceof Response) {
    return auth;
  }
  const { slug } = await context.params;
  if (!findApp(slug)) {
    return apiError(404, `No app found for slug "${slug}".`);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadJson();
  }
  const input = (body ?? {}) as {
    name?: unknown;
    node?: unknown;
    url?: unknown;
  };
  const result = addApiEnv(slug, {
    name: input.name,
    node: input.node,
    url: input.url,
  });
  if (!result.ok) {
    return apiError(400, "The environment could not be created.", {
      errors: result.errors,
    });
  }
  return apiOk(result.env, 201);
}
