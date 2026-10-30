import type { NextRequest } from "next/server";
import { apiDbError, requireTokenManager } from "@/lib/api-auth";
import { apiOk } from "@/lib/api-response";
import { listEvents } from "@/lib/events";

/** Audit export for SIEM/SOC pull: newest events (token managers). */
export async function GET(request: NextRequest) {
  const manager = await requireTokenManager(request);
  if (manager instanceof Response) {
    return manager;
  }
  try {
    return apiOk(await listEvents(200));
  } catch {
    return apiDbError();
  }
}
