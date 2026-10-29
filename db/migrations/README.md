# Migrations live here as self-registering TypeScript modules.

Each file is named `NNNN_topic.ts`, embeds its SQL as a string, and calls
`registerMigration(name, sql)` from `@/lib/db` at import time. The domain
module that owns the tables imports its migration file for the side
effect; `migrate()` applies every registered migration in name order,
tracked in `schema_migrations`. See `docs/database.md`.
