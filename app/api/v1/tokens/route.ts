import type { NextRequest } from "next/server";
import { apiDbError, requireTokenManager } from "@/lib/api-auth";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import {
  hasAnyTokens,
  issueToken,
  listTokenInfos,
  validateScopes,
  validateTokenName,
} from "@/lib/api-tokens";

/**
 * Token metadata for every token, oldest first. Secrets and hashes are
 * never exposed here — the full secret exists only in the POST response.
 */
export async function GET(request: NextRequest) {
  const manager = await requireTokenManager(request);
  if (manager instanceof Response) {
    return manager;
  }
  try {
    return apiOk(await listTokenInfos());
  } catch {
    return apiDbError();
  }
}

/**
 * Issue a token. The first token on a fresh install needs no credentials
 * (bootstrap); afterwards issuance requires a valid token or an admin
 * session. The response carries the secret — it cannot be recovered.
 */
export async function POST(request: NextRequest) {
  try {
    if (await hasAnyTokens()) {
      const manager = await requireTokenManager(request);
      if (manager instanceof Response) {
        return manager;
      }
    }
  } catch {
    return apiDbError();
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadJson();
  }
  const name = (body as { name?: unknown } | null)?.name;
  const nameError = validateTokenName(name);
  if (nameError) {
    return apiError(400, nameError, { errors: { name: nameError } });
  }
  const scopes = validateScopes((body as { scopes?: unknown } | null)?.scopes);
  if (!scopes.ok) {
    return apiError(400, scopes.error, { errors: { scopes: scopes.error } });
  }
  try {
    const { info, token } = await issueToken(name as string, scopes.scopes);
    return apiOk({ ...info, token }, 201);
  } catch {
    return apiDbError();
  }
}
