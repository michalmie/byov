import type { NextRequest } from "next/server";
import { apiDbError, requireScope } from "@/lib/api-auth";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import { createPreview } from "@/lib/cell";

/** Create (or redeploy) a branch preview env and deploy it. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireScope(request, "apps:write");
  if (auth instanceof Response) return auth;
  const { slug } = await context.params;
  const actor = auth.kind === "token" ? auth.token.name : auth.email;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadJson();
  }
  const branch = (body as { branch?: unknown } | null)?.branch;
  if (typeof branch !== "string" || !branch.trim()) {
    return apiError(400, "Give the preview a branch name.");
  }
  try {
    const result = await createPreview(slug, branch.trim(), actor);
    if (!result.ok) return apiError(400, result.error);
    return apiOk({ env: result.env, deployed: result.deployed }, 201);
  } catch {
    return apiDbError();
  }
}
