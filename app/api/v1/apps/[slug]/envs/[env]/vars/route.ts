import type { NextRequest } from "next/server";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import { maskEnvVars, setEnvVars, validateEnvVars } from "@/lib/cell";
import { findAppEnv } from "@/lib/api-apps";

/** Masked var keys for one env (values never leave the server). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; env: string }> },
) {
  const auth = await requireScope(request, "apps:read");
  if (auth instanceof Response) return auth;
  const { slug, env } = await context.params;
  let found;
  try {
    found = await findAppEnv(slug, env);
  } catch {
    return apiDbError();
  }
  if (!found) return apiError(404, `No environment "${env}" found for app "${slug}".`);
  return apiOk(maskEnvVars(found.env));
}

/** Replace all vars for one env; deploy pushes them to the provider. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string; env: string }> },
) {
  const auth = await requireScope(request, "apps:write");
  if (auth instanceof Response) return auth;
  const { slug, env } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadJson();
  }
  const validated = validateEnvVars(body);
  if (!validated.ok) return apiError(400, validated.error);
  try {
    const result = await setEnvVars(slug, env, validated.vars);
    if (!result.ok) return apiError(404, result.error);
    return apiOk({ keys: result.keys });
  } catch {
    return apiDbError();
  }
}
