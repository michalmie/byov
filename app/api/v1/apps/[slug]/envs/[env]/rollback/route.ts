import type { NextRequest } from "next/server";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiError, apiOk } from "@/lib/api-response";
import { rollbackEnv } from "@/lib/cell";

/** Roll one env back by redeploying its provider app. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; env: string }> },
) {
  const auth = await requireScope(request, "apps:write");
  if (auth instanceof Response) return auth;
  const { slug, env } = await context.params;
  const actor = auth.kind === "token" ? auth.token.name : auth.email;
  let deploymentId = "";
  try {
    const body = (await request.json().catch(() => null)) as { deploymentId?: unknown } | null;
    deploymentId = typeof body?.deploymentId === "string" ? body.deploymentId : "";
  } catch {
    deploymentId = "";
  }
  try {
    const result = await rollbackEnv(slug, env, deploymentId, actor);
    if (!result.ok) return apiError(400, result.error);
    return apiOk(result, 202);
  } catch {
    return apiDbError();
  }
}
