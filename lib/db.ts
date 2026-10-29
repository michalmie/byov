/**
 * Postgres database layer for the Control Plane: connection pool, config
 * and the migration runner. ALL server-side persisted state (API tokens,
 * apps, auth bootstrap, mail account, OTP codes, rate limits, workspace
 * state) lives in Postgres; the server fails fast when `DATABASE_URL` is
 * not a postgres connection string.
 *
 * Migrations are self-registering TypeScript modules under
 * `db/migrations/` (embedded SQL strings, no runtime file reads, so the
 * standalone production build works). Each migration file calls
 * `registerMigration(name, sql)` on import; domain modules import their
 * migration file for its side effect, and `migrate()` applies every
 * registered migration in name order, tracked in `schema_migrations`.
 * Migration names double as the global order — keep the `NNNN_topic.ts`
 * file naming so parallel work never edits a shared registry.
 *
 * The pool migrates lazily on first use: every `query()` runs pending
 * migrations first (once per process). Nothing touches the database at
 * module import, so `next build` stays offline-safe.
 *
 * Node-only (imports `pg`): never import from `middleware.ts` (Edge) or
 * client components. Unit tests must NOT need a live database — mock
 * this module with `vi.mock("@/lib/db")`, or drive `migrate()` with a
 * fake `Queryable` as `tests/unit/db.test.ts` does.
 */

import { Pool } from "pg";

/** Minimal query surface: real `pg` pools/clients satisfy this. */
export interface Queryable {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface Migration {
  name: string;
  sql: string;
}

const migrationRegistry = new Map<string, string>();

/**
 * Register one migration. Called at the top level of each
 * `db/migrations/NNNN_topic.ts` module. Re-registering a name is a
 * no-op (first import wins) so repeated imports stay harmless.
 */
export function registerMigration(name: string, sql: string): void {
  if (!migrationRegistry.has(name)) {
    migrationRegistry.set(name, sql);
  }
}

/** All registered migrations, sorted by name (the global apply order). */
export function getMigrations(): Migration[] {
  return [...migrationRegistry.entries()]
    .map(([name, sql]) => ({ name, sql }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * The required Postgres connection string. Throws when unset, blank, or
 * not a postgres URL — the server must fail fast, never silently run
 * without its database.
 */
export function getDatabaseUrl(): string {
  const url = (process.env.DATABASE_URL ?? "").trim();
  if (!url) {
    throw new Error(
      "[db] DATABASE_URL is not set. Set it to a postgres:// connection string; see docs/database.md.",
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      "[db] DATABASE_URL must be a postgres:// connection string.",
    );
  }
  return url;
}

let pool: Pool | null = null;
let migratePromise: Promise<string[]> | null = null;

/** Process-wide pool singleton. Throws (via `getDatabaseUrl`) without a DB. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (error) => {
      console.error("[db] idle pool error", error);
    });
  }
  return pool;
}

async function runMigrations(
  client: Queryable,
  migrations: Migration[],
): Promise<string[]> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );
  const recorded = await client.query("SELECT name FROM schema_migrations");
  const done = new Set(recorded.rows.map((row) => String(row.name)));
  const applied: string[] = [];
  const ordered = [...migrations].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const migration of ordered) {
    if (done.has(migration.name)) {
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        migration.name,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original error is what matters.
      }
      throw error;
    }
    applied.push(migration.name);
  }
  return applied;
}

/**
 * Apply pending migrations in name order on one connection, tracked in
 * `schema_migrations`. Idempotent: recorded migrations are skipped.
 * Each migration runs in its own transaction. Defaults to the process
 * pool and the registered migrations; tests pass a fake client and an
 * explicit list instead.
 */
export async function migrate(
  client?: Queryable,
  migrations: Migration[] = getMigrations(),
): Promise<string[]> {
  if (client) {
    return runMigrations(client, migrations);
  }
  const connection = await getPool().connect();
  try {
    return await runMigrations(connection, migrations);
  } finally {
    connection.release();
  }
}

function ensureMigrated(): Promise<string[]> {
  if (!migratePromise) {
    migratePromise = migrate().catch((error: unknown) => {
      // A failed attempt must not poison later calls (e.g. the DB was
      // briefly unreachable at first request).
      migratePromise = null;
      throw error;
    });
  }
  return migratePromise;
}

/** Run a query (migrating first); resolves to the result rows. */
export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  await ensureMigrated();
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** First row of a query, or null when the result is empty. */
export async function queryOne<T>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Close the pool and forget the migrate-once state (tests / shutdown). */
export async function closePool(): Promise<void> {
  migratePromise = null;
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}
