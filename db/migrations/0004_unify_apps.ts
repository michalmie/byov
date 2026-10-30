import { registerMigration } from "@/lib/db";

// Unify the split app stores: `api_apps` (machine API, 0001) and
// `workspace_apps` (browser workspace, 0003) held the same concept in
// two tables, so UI-created and API-created apps were invisible to
// each other. `workspace_apps` becomes the single source of truth;
// copy any API-only rows across. Rows already present in
// `workspace_apps` win (they carry the merged UI view).
registerMigration(
  "0004_unify_apps",
  `INSERT INTO workspace_apps (slug, data)
   SELECT slug, data FROM api_apps
   ON CONFLICT (slug) DO NOTHING;`,
);
