"use client";

import { useEffect, useState } from "react";
import type { ActivityItem } from "./control-plane";
import { recentActivity } from "./control-plane";

/**
 * Activity feed data: persisted audit events when any exist, sample
 * feed until then (fresh installs still demo well). Fetch failures
 * keep the sample feed.
 */
export function useActivity(): ActivityItem[] {
  const [items, setItems] = useState<ActivityItem[]>(() => recentActivity());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/workspace/activity", {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; data?: ActivityItem[] };
        if (cancelled || body.ok !== true || !Array.isArray(body.data)) return;
        if (body.data.length > 0) {
          setItems(body.data);
        }
      } catch {
        // Offline/tests: sample feed stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}
