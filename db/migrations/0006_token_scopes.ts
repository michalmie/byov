import { registerMigration } from "@/lib/db";

// Scoped API tokens: `scopes` holds a JSON array of scope strings
// (apps:read, apps:write, tokens:manage). NULL means a pre-scope
// token, which keeps full access so existing connectors keep working.
registerMigration(
  "0006_token_scopes",
  `ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS scopes TEXT NULL;`,
);
