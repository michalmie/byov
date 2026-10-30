import type { NextRequest } from "next/server";
import { apiOk } from "@/lib/api-response";
import { eventsToActivity, listEvents } from "@/lib/events";
import { isAuthFailure, requireWorkspaceSession } from "../_lib";

/** Persisted audit/activity trail, newest first (session only). */
export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceSession(request);
  if (isAuthFailure(auth)) {
    return auth;
  }
  const events = await listEvents(50);
  return apiOk(eventsToActivity(events));
}
