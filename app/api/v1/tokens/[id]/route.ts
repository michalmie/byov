import type { NextRequest } from "next/server";
import { apiDbError, requireTokenManager } from "@/lib/api-auth";
import { apiError, apiOk } from "@/lib/api-response";
import { revokeToken } from "@/lib/api-tokens";

/** Revoke a token by id. The record stays listed with `revokedAt` set. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const manager = await requireTokenManager(request);
  if (manager instanceof Response) {
    return manager;
  }
  const { id } = await context.params;
  let info;
  try {
    info = await revokeToken(id);
  } catch {
    return apiDbError();
  }
  if (!info) {
    return apiError(404, `No token found for id "${id}".`);
  }
  return apiOk(info);
}
