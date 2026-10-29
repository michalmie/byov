import type { NextRequest } from "next/server";
import {
  deleteWorkspaceStack,
  updateWorkspaceStack,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { StackDraft, StackLayer } from "@/lib/stacks";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceSession,
} from "../../_lib";

function asDraft(body: Record<string, unknown>): StackDraft {
  const text = (value: unknown): string =>
    typeof value === "string" ? value : "";
  const stack = Array.isArray(body.stack)
    ? (body.stack as StackLayer[])
    : [];
  const nodes = Array.isArray(body.nodes)
    ? body.nodes.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  return {
    name: text(body.name),
    tagline: text(body.tagline),
    status: text(body.status),
    stack,
    nodes,
    testCommand: text(body.testCommand),
    lintCommand: text(body.lintCommand),
    buildCommand: text(body.buildCommand),
    starterRef: text(body.starterRef),
  };
}

/** Update a custom stack by slug; the slug itself never changes. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const { slug } = await context.params;
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await updateWorkspaceStack(slug, asDraft(body));
  if (!result.ok) {
    if ("notFound" in result) {
      return apiError(404, `No custom stack found for slug "${slug}".`);
    }
    return apiError(400, "The stack could not be updated.", {
      errors: result.errors,
    });
  }
  return apiOk(result.stack);
}

/** Remove a custom stack; shipped stacks cannot be removed. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const { slug } = await context.params;
  const result = await deleteWorkspaceStack(slug);
  if (!result.ok) {
    return apiError(404, `No custom stack found for slug "${slug}".`);
  }
  return apiOk({ slug });
}
