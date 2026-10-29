import type { NextRequest } from "next/server";
import {
  getWorkspaceSettings,
  saveWorkspaceSettings,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { WorkspaceSettings } from "@/lib/settings";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceSession,
} from "../_lib";

function asDraft(body: Record<string, unknown>): WorkspaceSettings {
  const text = (value: unknown): string =>
    typeof value === "string" ? value : "";
  const scenarios =
    typeof body.appScenarios === "object" &&
    body.appScenarios !== null &&
    !Array.isArray(body.appScenarios)
      ? (body.appScenarios as WorkspaceSettings["appScenarios"])
      : {};
  return {
    workspaceName: text(body.workspaceName),
    defaultNode: text(body.defaultNode),
    devZone: text(body.devZone),
    tailnetDomain: text(body.tailnetDomain),
    defaultScenario: text(body.defaultScenario) as WorkspaceSettings["defaultScenario"],
    appScenarios: scenarios,
  };
}

/** Current workspace settings (defaults when nothing is saved yet). */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  return apiOk(await getWorkspaceSettings());
}

/** Replace the workspace settings. */
export async function PUT(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await saveWorkspaceSettings(asDraft(body));
  if (!result.ok) {
    return apiError(400, "The settings could not be saved.", {
      errors: result.errors,
    });
  }
  return apiOk(result.settings);
}
