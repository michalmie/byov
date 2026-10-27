# Tech stacks

Paved-road starters for vibe-coded apps. Each stack gives citizen
developers technologies that pass the Control Plane gates from the
first commit.

## Catalog

| Stack | Technologies | Status |
|---|---|---|
| `byov-stack` | Next.js 16 + React 19 + TypeScript 5 + Tailwind 4 + Vitest 4 | Stable |
| `ai-chatbot` | Next.js 16 + AI SDK 5 + Tailwind 4 | Draft |
| `vite-spa` | Vite 7 + React 19 + TypeScript 5 + Tailwind 4 + Vitest 4 | Draft |
| `fastapi-service` | FastAPI + Python 3.12 + PostgreSQL 16 + pytest + Ruff | Draft |

## Layer taxonomy

Every layer in a stack carries a category so the UI can group
technologies by where they sit in the system:

| Category | Covers |
|---|---|
| `frontend` | App frameworks, UI kits, styling |
| `server` | APIs, backends, server frameworks |
| `database` | Databases, stores, search |
| `language` | Programming languages |
| `testing` | Test runners and harnesses |
| `quality` | Linters and formatters |
| `runtime` | Runtimes and servers that execute the code |
| `ai` | Models, agents and AI SDKs |

## Stack contract

One folder per stack under `stacks/<slug>/`:

- `manifest.json` — the single source of truth the UI and tests read:
  slug, name, tagline, status, categorized layers, package versions,
  scripts, required checks, node targets, scaffold steps, starter ref,
  docs.
- `README.md` — scaffold, run and ship guide for developers.
- `blueprint.md` — file tree, configs and the definition of done.

Rules for every stack:

- Checks mirror the Control Plane required gates: unit tests, lint,
  production build, DLP scan, dependency audit.
- Package versions track the verified stack — the registry tests fail
  when the manifest drifts.
- Scaffolded apps use their own port. The Control Plane uses `3014`.
- No secrets, env values or real data in stack files.

## Workspace stacks

Shipped manifests are the catalog everyone gets. On top of them, each
workspace can define its own stacks in Settings → Tech stacks: New,
Clone, Edit and Remove. Workspace stacks live in the browser
(localStorage) until the API lands — same deal as managed nodes.

Rules for workspace stacks:

- Shipped stacks are read-only; Clone starts an editable copy.
- The slug derives from the name at creation and never changes.
- Gate names stay governed: customs inherit the five required checks
  (unit tests, lint, production build, DLP scan, dependency audit) and
  only adapt the test/lint/build commands per stack.
- Purpose-built logic lives in `lib/stacks.ts` (drafts, validation,
  build, stored parsing) with hooks in `lib/stack-store.ts`.

## Adding a stack

1. Copy `stacks/byov-stack/` to `stacks/<slug>/` and rewrite the
   manifest, README and blueprint for the new stack.
2. Register the manifest in `lib/stacks.ts`.
3. Add the stack to the catalog table above.
4. Extend `tests/unit/stacks.test.ts` — versions, scripts, gates.
5. Keep `npm run test:unit`, `npm run lint`, `npm run typecheck`
   and `npm run build` green.
