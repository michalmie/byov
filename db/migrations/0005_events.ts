import { registerMigration } from "@/lib/db";

// Persisted control-plane events: the audit/activity trail. Every
// governed action (app create, gate run, deploy, block) records one
// row; dashboard and /activity read these instead of sample data
// once any exist.
registerMigration(
  "0005_events",
  `CREATE TABLE IF NOT EXISTS workspace_events (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    text TEXT NOT NULL,
    app_slug TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS workspace_events_created_idx
    ON workspace_events (created_at DESC);`,
);
