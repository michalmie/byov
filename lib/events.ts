/**
 * Persisted control-plane events (audit/activity trail).
 * Node-only. Writers record governed actions; readers get newest
 * first. `ActivityItem.when` stays display text (ISO timestamp) so
 * existing feed components render persisted rows unchanged.
 */

import "@/db/migrations/0005_events";
import { query } from "@/lib/db";
import type { ActivityItem } from "./control-plane";

export interface StoredEvent {
  id: string;
  actor: string;
  text: string;
  appSlug: string | null;
  createdAt: string;
}

function eventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<unknown>;
let siemFetch: FetchFn = (url, init) => fetch(url, init);

/** Test seam: replace the SIEM transport (default global fetch). */
export function _setSiemFetch(fn: FetchFn): void {
  siemFetch = fn;
}

/** Forward one event to the SIEM webhook when configured. */
async function dispatchSiem(event: StoredEvent): Promise<void> {
  const url = (process.env.BYOV_SIEM_WEBHOOK_URL ?? "").trim();
  if (!url) return;
  try {
    await siemFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "byov", ...event }),
    });
  } catch {
    // SIEM delivery is best-effort; the persisted row is the record.
  }
}

/** Record one governed action. Never throws into the caller's flow. */
export async function recordEvent(input: {
  actor: string;
  text: string;
  appSlug?: string;
}): Promise<void> {
  const event: StoredEvent = {
    id: eventId(),
    actor: input.actor,
    text: input.text,
    appSlug: input.appSlug ?? null,
    createdAt: new Date().toISOString(),
  };
  try {
    await query(
      "INSERT INTO workspace_events (id, actor, text, app_slug) VALUES ($1, $2, $3, $4)",
      [event.id, event.actor, event.text, event.appSlug],
    );
  } catch {
    // Audit must not break the action it describes; the action's own
    // result already reached the caller. (Follow-up: retry queue.)
  }
  await dispatchSiem(event);
}

/** Newest persisted events, capped. */
export async function listEvents(limit = 50): Promise<StoredEvent[]> {
  const rows = await query<{
    id: string;
    actor: string;
    text: string;
    appSlug: string | null;
    createdAt: Date | string;
  }>(
    `SELECT id, actor, text, app_slug AS "appSlug", created_at AS "createdAt"
     FROM workspace_events ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    text: r.text,
    appSlug: r.appSlug,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

/** Feed shape for dashboard/activity (ISO `when` renders as-is). */
export function eventsToActivity(events: StoredEvent[]): ActivityItem[] {
  return events.map((e) => ({ when: e.createdAt, actor: e.actor, text: e.text }));
}
