import type { NextRequest } from "next/server";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import { verifyCoolifyConnection } from "@/lib/coolify-adapter";
import { resolveNodeToken } from "@/lib/node-credentials";
import { touchWorkspaceNode } from "@/lib/workspace-store";
import { isAuthFailure, readJsonBody, requireWorkspaceAdmin } from "../../_lib";

/**
 * Authenticated Coolify check: verifies endpoint + token (the pasted
 * token, else the node's saved token, else env fallback) with one
 * read from the BYOV server. Never returns the token.
 */
export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    return apiError(400, "Enter the node endpoint first.");
  }
  const pasted = typeof body.apiToken === "string" ? body.apiToken.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const token = pasted || (slug ? await resolveNodeToken(slug) : "");
  if (!token) {
    return apiOk({
      ok: false,
      detail: "No API token to test yet — paste the Coolify API token first.",
    });
  }
  const result = await verifyCoolifyConnection(endpoint, token);
  if (result.ok && slug) {
    // A passing authenticated test is first contact: a Pending node
    // becomes healthy immediately, no deploy needed.
    await touchWorkspaceNode(slug).catch(() => undefined);
  }
  return apiOk(result);
}
