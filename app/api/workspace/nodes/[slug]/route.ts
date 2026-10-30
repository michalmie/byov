import type { NextRequest } from "next/server";
import {
  deleteWorkspaceNode,
  updateWorkspaceNode,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { NodeDraft } from "@/lib/settings";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceAdmin,
} from "../../_lib";

function asDraft(body: Record<string, unknown>): NodeDraft {
  const text = (value: unknown): string =>
    typeof value === "string" ? value : "";
  return {
    name: text(body.name),
    kind: text(body.kind),
    location: text(body.location),
    endpoint: text(body.endpoint),
    domainZone: text(body.domainZone),
    tailnetHost: text(body.tailnetHost),
  };
}

/** Update a node by slug; the slug itself never changes. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const { slug } = await context.params;
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await updateWorkspaceNode(slug, asDraft(body));
  if (!result.ok) {
    if ("notFound" in result) {
      return apiError(404, `No node found for slug "${slug}".`);
    }
    return apiError(400, "The node could not be updated.", {
      errors: result.errors,
    });
  }
  return apiOk(result.node);
}

/** Remove a node unless environments are pinned to it. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const { slug } = await context.params;
  const result = await deleteWorkspaceNode(slug);
  if (!result.ok) {
    if ("notFound" in result) {
      return apiError(404, `No node found for slug "${slug}".`);
    }
    return apiError(400, result.error, { usage: result.usage });
  }
  return apiOk({ slug });
}
