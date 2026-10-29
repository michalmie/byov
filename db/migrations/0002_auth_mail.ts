import { registerMigration } from "../../lib/db";

registerMigration(
  "0002_auth_mail",
  `CREATE TABLE IF NOT EXISTS auth_bootstrap (
    id INTEGER PRIMARY KEY,
    admin_email TEXT NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT auth_bootstrap_single_row CHECK (id = 1)
  );
  CREATE TABLE IF NOT EXISTS mail_account (
    id INTEGER PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    security TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    pass TEXT NOT NULL DEFAULT '',
    from_address TEXT NOT NULL DEFAULT '',
    CONSTRAINT mail_account_single_row CHECK (id = 1)
  );
  CREATE TABLE IF NOT EXISTS auth_otps (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS auth_rate_limits (
    rate_key TEXT NOT NULL,
    hit_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS auth_rate_limits_key_hit_idx
    ON auth_rate_limits (rate_key, hit_at);`,
);
