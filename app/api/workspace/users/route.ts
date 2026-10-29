import type { NextRequest } from "next/server";
import {
  inviteWorkspaceUser,
  listWorkspaceUsers,
} from "@/lib/workspace-store";
import { apiBadJson, apiError, apiOk } from "@/lib/api-response";
import type { UserRole } from "@/lib/users";
import {
  isAuthFailure,
  readJsonBody,
  requireWorkspaceAdmin,
} from "../_lib";

/** Every workspace user. Admins only. */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  return apiOk(await listWorkspaceUsers());
}

/** Invite a user: `{ email, role }`. Admins only. */
export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceAdmin(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const body = await readJsonBody(request);
  if (!body) {
    return apiBadJson();
  }
  const email = typeof body.email === "string" ? body.email : "";
  const role = body.role as UserRole;
  if (role !== "admin" && role !== "member") {
    return apiError(400, "Choose a role: admin or member.");
  }
  const result = await inviteWorkspaceUser(email, role);
  if (!result.ok) {
    return apiError(400, result.error);
  }
  return apiOk(result.user, 201);
}
