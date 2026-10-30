import type { NextRequest } from "next/server";
import { findAppEnv } from "@/lib/api-apps";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiError, apiOk } from "@/lib/api-response";

/** One environment of one API-created app. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; env: string }> },
) {
  const auth = await requireScope(request, "apps:read");
  if (auth instanceof Response) {
    return auth;
  }
  const { slug, env } = await context.params;
  let found;
  try {
    found = await findAppEnv(slug, env);
  } catch {
    return apiDbError();
  }
  if (!found) {
    return apiError(
      404,
      `No environment "${env}" found for app "${slug}".`,
    );
  }
  return apiOk(found.env);
}
