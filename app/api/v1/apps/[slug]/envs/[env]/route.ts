import type { NextRequest } from "next/server";
import { findAppEnv } from "@/lib/api-apps";
import { requireApiAuth } from "@/lib/api-auth";
import { apiError, apiOk } from "@/lib/api-response";

/** One environment of one API-created app. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; env: string }> },
) {
  const auth = await requireApiAuth(request);
  if (auth instanceof Response) {
    return auth;
  }
  const { slug, env } = await context.params;
  const found = findAppEnv(slug, env);
  if (!found) {
    return apiError(
      404,
      `No environment "${env}" found for app "${slug}".`,
    );
  }
  return apiOk(found.env);
}
