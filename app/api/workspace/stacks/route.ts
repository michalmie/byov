import type { NextRequest } from "next/server";
import {
  createWorkspaceStack,
  listWorkspaceStacks,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { StackDraft, StackLayer } from "@/lib/stacks";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceAdmin,
  requireWorkspaceSession,
} from "../_lib";

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

/** Every custom stack, oldest slug first. The shipped catalog stays UI-side. */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  return apiOk(await listWorkspaceStacks());
}

/** Define a workspace stack; checks keep the five governed gates. */
export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await createWorkspaceStack(asDraft(body));
  if (!result.ok) {
    return apiError(400, "The stack could not be created.", {
      errors: result.errors,
    });
  }
  return apiOk(result.stack, 201);
}
