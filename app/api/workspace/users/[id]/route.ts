import type { NextRequest } from "next/server";
import {
  removeWorkspaceUser,
  setWorkspaceUserRole,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { UserRole } from "@/lib/users";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceAdmin,
} from "../../_lib";

/** Change a user's role: `{ role }`. Admins only. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const role = body.role as UserRole;
  if (role !== "admin" && role !== "member") {
    return apiError(400, "Choose a role: admin or member.");
  }
  const result = await setWorkspaceUserRole(id, role);
  if (!result.ok) {
    if ("notFound" in result) {
      return apiError(404, "User not found.");
    }
    return apiError(400, result.error);
  }
  return apiOk(result.users.find((user) => user.id === id) ?? { id });
}

/** Remove a user unless they are the last admin. Admins only. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const { id } = await context.params;
  const result = await removeWorkspaceUser(id);
  if (!result.ok) {
    if ("notFound" in result) {
      return apiError(404, "User not found.");
    }
    return apiError(400, result.error);
  }
  return apiOk({ id });
}
