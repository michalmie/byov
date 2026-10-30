import { registerMigration } from "@/lib/db";

// Per-node provider credentials (Coolify API tokens), stored apart
// from the public node documents so tokens never travel with node
// JSON to the browser. Values are AES-256-GCM ciphertext (see
// lib/node-credentials.ts), never plaintext.
registerMigration(
  "0007_node_credentials",
  `CREATE TABLE IF NOT EXISTS workspace_node_credentials (
    slug TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,
);
