import type { NextRequest } from "next/server";
import {
  getWorkspaceAuthSettings,
  saveWorkspaceAuthSettings,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import {
  AUTH_PROVIDERS,
  type AuthSettings,
  type OAuthProviderId,
} from "@/lib/auth-settings";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceAdmin,
} from "../_lib";

function asDraft(body: Record<string, unknown>): AuthSettings {
  const flag = (value: unknown): boolean => value === true;
  const text = (value: unknown): string =>
    typeof value === "string" ? value : "";
  const providers = body.providers as Partial<
    Record<OAuthProviderId, unknown>
  > | null;
  const lifetime =
    typeof body.sessionLifetimeHours === "number"
      ? body.sessionLifetimeHours
      : Number.NaN;
  return {
    passwordlessEnabled: flag(body.passwordlessEnabled),
    magicLinkEnabled: flag(body.magicLinkEnabled),
    providers: Object.fromEntries(
      AUTH_PROVIDERS.map((id) => [id, flag(providers?.[id])]),
    ) as AuthSettings["providers"],
    allowedEmails: text(body.allowedEmails),
    allowedDomains: text(body.allowedDomains),
    adminEmails: text(body.adminEmails),
    sessionLifetimeHours: lifetime,
  };
}

/** Current auth settings (defaults when nothing is saved yet). Admins only. */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  return apiOk(await getWorkspaceAuthSettings());
}

/** Replace the auth settings. Admins only. */
export async function PUT(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const result = await saveWorkspaceAuthSettings(asDraft(body));
  if (!result.ok) {
    return apiError(400, "The auth settings could not be saved.", {
      errors: result.errors,
    });
  }
  return apiOk(result.settings);
}
