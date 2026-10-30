import type { NextRequest } from "next/server";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiError, apiOk } from "@/lib/api-response";
import { envLogs } from "@/lib/deploy";

/** Recent provider logs for one env. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; env: string }> },
) {
  const auth = await requireScope(request, "apps:read");
  if (auth instanceof Response) {
    return auth;
  }
  const { slug, env } = await context.params;
  let result;
  try {
    result = await envLogs(slug, env);
  } catch {
    return apiDbError();
  }
  if (!result.ok) {
    return apiError(400, result.error);
  }
  return apiOk(result);
}
