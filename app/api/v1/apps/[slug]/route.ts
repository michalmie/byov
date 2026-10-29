import type { NextRequest } from "next/server";
import { findApp } from "@/lib/api-apps";
import { requireApiAuth } from "@/lib/api-auth";
import { apiError, apiOk } from "@/lib/api-response";

/** One API-created app by slug. */
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
  return apiOk(app);
}
