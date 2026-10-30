import type { NextRequest } from "next/server";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiError, apiOk } from "@/lib/api-response";
import { deployEnv } from "@/lib/deploy";

/** Deploy one env via its node's adapter (Coolify first). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; env: string }> },
) {
  const auth = await requireScope(request, "apps:write");
  if (auth instanceof Response) {
    return auth;
  }
  const { slug, env } = await context.params;
  const actor = auth.kind === "token" ? auth.token.name : auth.email;
  let result;
  try {
    result = await deployEnv(slug, env, actor);
  } catch {
    return apiDbError();
  }
  if (!result.ok) {
    return apiError(400, result.error);
  }
  return apiOk(
    { deployment: result.deployment, providerId: result.providerId, env },
    202,
  );
}
