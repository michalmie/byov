import type { NextRequest } from "next/server";
import {
  getWorkspaceSourceControlSettings,
  saveWorkspaceSourceControlSettings,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import {
  GITHUB_ACCOUNT_TYPES,
  REPO_PROVIDERS,
  REPO_VISIBILITIES,
  type GitHubAccountType,
  type RepoProvider,
  type RepoVisibility,
  type SourceControlSettings,
} from "@/lib/source-control";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceAdmin,
} from "../_lib";

function asDraft(body: Record<string, unknown>): SourceControlSettings {
  const flag = (value: unknown): boolean => value === true;
  const text = (value: unknown): string =>
    typeof value === "string" ? value : "";
  const accountType = GITHUB_ACCOUNT_TYPES.includes(
    body.accountType as GitHubAccountType,
  )
    ? (body.accountType as GitHubAccountType)
    : "organization";
  const defaultVisibility = REPO_VISIBILITIES.includes(
    body.defaultVisibility as RepoVisibility,
  )
    ? (body.defaultVisibility as RepoVisibility)
    : "private";
  return {
    provider: REPO_PROVIDERS.includes(body.provider as RepoProvider)
      ? (body.provider as RepoProvider)
      : "github",
    connected: flag(body.connected),
    accountType,
    accountLogin: text(body.accountLogin),
    installationId: text(body.installationId),
    defaultVisibility,
    allowPublicRepos: flag(body.allowPublicRepos),
    repoPattern: text(body.repoPattern),
    repoPrefix: text(body.repoPrefix),
    repoSuffix: text(body.repoSuffix),
    defaultBranch: text(body.defaultBranch) || "main",
    autoCreateRepo: flag(body.autoCreateRepo),
    topics: text(body.topics),
  };
}

/** Current code-repository settings (defaults when nothing is saved yet). Admins only. */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  return apiOk(await getWorkspaceSourceControlSettings());
}

/** Replace the code-repository settings. Admins only. */
export async function PUT(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await saveWorkspaceSourceControlSettings(asDraft(body));
  if (!result.ok) {
    return apiError(400, "The code repository settings could not be saved.", {
      errors: result.errors,
    });
  }
  return apiOk(result.settings);
}
