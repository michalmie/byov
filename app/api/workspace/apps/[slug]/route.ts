import type { NextRequest } from "next/server";
import { deleteWorkspaceApp } from "@/lib/workspace-store";
import { apiError, apiOk } from "@/lib/api-response";
import { isAuthFailure, requireWorkspaceSession } from "../../_lib";

/** Remove a workspace app; sample apps cannot be removed. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const { slug } = await context.params;
  const result = await deleteWorkspaceApp(slug);
  if (!result.ok) {
    return apiError(404, `No workspace app found for slug "${slug}".`);
  }
  return apiOk({ slug });
}
