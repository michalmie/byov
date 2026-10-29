# BYOV database (Postgres)

All Control Plane server state lives in Postgres: API tokens, apps and
environments, the auth bootstrap claim, the saved mail account, OTP
codes, rate limits, and workspace state (nodes, settings, workspace
apps, custom stacks, users, auth settings). There is no file-store
fallback: the server fails fast when `DATABASE_URL` is unset or not a
postgres URL.

## Configure

```sh
# Create the role and database once:
psql -c "CREATE ROLE byov LOGIN PASSWORD 'byov';"
psql -c "CREATE DATABASE byov OWNER byov;"

# Point the app at it (dev: .env.local; prod: environment):
DATABASE_URL=postgres://byov:byov@localhost:5432/byov
```

Tables are created automatically: the first database use in the server
process runs pending migrations (`lib/db.ts`, tracked in
`schema_migrations`). Nothing migrates at import or build time, so
`next build` stays offline-safe.

## Code layer (`lib/db.ts`)

- `getDatabaseUrl()` — required connection string; throws otherwise.
- `getPool()` — process-wide `pg` pool singleton (max 10).
- `query<T>(text, params?)` / `queryOne<T>(text, params?)` — migrate
  first, then run a parameterized query. Always use `$1`-style
  parameters; never interpolate values into SQL.
- `migrate(client?, migrations?)` — apply pending migrations in name
  order, each in its own transaction. Defaults to the pool and the
  registered set; tests pass a fake client plus an explicit list.
- `registerMigration(name, sql)` / `getMigrations()` — the registry.
- `closePool()` — end the pool and forget migrate-once state (tests,
  shutdown).

Node-only: like the other server stores, never import from
`middleware.ts` (Edge) or client components. `lib/auth.ts` session and
allowlist helpers stay Edge-safe; only the OTP/rate-limit functions
moved to the database-backed module.

## Authoring a migration

One file per topic under `db/migrations/`, named `NNNN_topic.ts`:

```ts
import { registerMigration } from "@/lib/db";

registerMigration(
  "0001_tokens_apps",
  `CREATE TABLE IF NOT EXISTS api_tokens ( ... );`,
);
```

Rules:

- The file name (minus `.ts`) and the registered name match; names are
  the global apply order, so never rename or edit a landed migration —
  add a new one.
- Keep SQL idempotent (`IF NOT EXISTS`, guarded `ALTER TABLE`) so a
  retried migration cannot half-apply.
- The domain module that owns the tables imports its migration file
  for the side effect (`import "@/db/migrations/0001_tokens_apps";`),
  guaranteeing the tables exist wherever the domain is used.
- Disjoint ownership: each migration file has exactly one owning
  change; parallel work must not edit the same migration.

## Current migrations

- `0001_tokens_apps` — `api_tokens` (id, name, token_hash, created_at,
  last_used_at, revoked_at) and `api_apps` (slug, JSONB `data`).
- `0002_auth_mail` — `auth_bootstrap` and `mail_account` (single-row),
  `auth_otps` (email, code, expires_at, attempts) and
  `auth_rate_limits` (rate_key, hit_at, indexed).
- `0003_workspace` — `workspace_nodes`, `workspace_apps`,
  `workspace_stacks`, `workspace_users` (JSONB documents) and
  `workspace_kv` (settings, auth settings).

## Testing

- Unit tests never need a live database: `vi.mock("@/lib/db")` the
  `query`/`queryOne` surface, or drive `migrate()` with a fake
  `Queryable` (see `tests/unit/db.test.ts`). `npm run test:unit` runs
  in a clean environment without `DATABASE_URL` and must stay green.
- For a live check, use a scratch database (each developer/agent their
  own name to avoid clashes) and throwaway scripts under `/tmp`:

```sh
createdb byov_smoke_michal
DATABASE_URL=postgres:///byov_smoke_michal?host=/var/run/postgresql \
  node --experimental-strip-types /tmp/db-smoke.ts
```

## Operations

- Production needs a managed or self-hosted Postgres reachable from
  the Control Plane; migrations apply themselves on first use after
  each deploy. Back up with `pg_dump` on your usual schedule.
- Task previews (`deploy/preview.mjs`) currently set a sqlite
  `DATABASE_URL`, which the server now rejects: previews need a
  Postgres `DATABASE_URL` (or a preview Postgres service) before they
  can boot this slice. The preview adapter is Factory-owned and was
  deliberately left untouched.
