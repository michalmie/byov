import type { NextRequest } from "next/server";
import {
  createWorkspaceNode,
  listWorkspaceNodes,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { NodeDraft } from "@/lib/settings";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceSession,
} from "../_lib";

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

/** Every workspace node, oldest slug first. Samples stay UI-side. */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  return apiOk(await listWorkspaceNodes());
}

/** Create a node: `{ name, kind, location, endpoint?, domainZone?, tailnetHost? }`. */
export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await createWorkspaceNode(asDraft(body));
  if (!result.ok) {
    return apiError(400, "The node could not be created.", {
      errors: result.errors,
    });
  }
  return apiOk(result.node, 201);
}
