# App templates

Paved-road starters for vibe-coded apps. Each template gives citizen
developers a stack that passes the Control Plane gates from the first commit.

## Catalog

| Template | Stack | Status |
|---|---|---|
| `byov-stack` | Next.js 16 + React 19 + TypeScript 5 + Tailwind 4 + Vitest 4 | Stable |

## Template contract

One folder per stack under `templates/<slug>/`:

- `manifest.json` — the single source of truth the UI and tests read:
  slug, name, tagline, status, stack layers, package versions, npm scripts,
  required checks, node targets, scaffold steps, starter ref, docs.
- `README.md` — scaffold, run and ship guide for developers.
- `blueprint.md` — file tree, configs and the definition of done.

Rules for every template:

- Checks mirror the Control Plane required gates: unit tests, lint,
  production build, DLP scan, dependency audit.
- Package versions track the verified stack — the registry tests fail
  when the manifest drifts.
- Scaffolded apps use their own port. The Control Plane uses `3014`.
- No secrets, env values or real data in template files.

## Adding a stack

1. Copy `templates/byov-stack/` to `templates/<slug>/` and rewrite the
   manifest, README and blueprint for the new stack.
2. Register the manifest in `lib/templates.ts`.
3. Add the stack to the catalog table above.
4. Extend `tests/unit/templates.test.ts` — versions, scripts, gates.
5. Keep `npm run test:unit`, `npm run lint`, `npm run typecheck`
   and `npm run build` green.
