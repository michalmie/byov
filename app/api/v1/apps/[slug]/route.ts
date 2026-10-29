import type { NextRequest } from "next/server";
import { findApp } from "@/lib/api-apps";
import { apiDbError, requireApiAuth } from "@/lib/api-auth";
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
  let app;
  try {
    app = await findApp(slug);
  } catch {
    return apiDbError();
  }
  if (!app) {
    return apiError(404, `No app found for slug "${slug}".`);
  }
  return apiOk(app);
}
