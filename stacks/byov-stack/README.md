# BYOV stack

The stack BYOV itself is built on: Next.js 16 (App Router), React 19,
TypeScript 5 (strict), Tailwind CSS 4, Vitest 4 + Testing Library,
ESLint 9, Node.js 20+. Scaffolded apps pass the Control Plane gates
from the first commit.

## Scaffold

1. Copy the file tree in [blueprint.md](blueprint.md) into a new repo.
2. `npm ci`
3. `cp .env.example .env.local` and fill in local values.
4. `npm run dev` — pick a free port; the Control Plane uses `3014`.

## Gates

Every change must pass:

| Check | Command |
|---|---|
| Unit tests | `npm run test:unit` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Production build | `npm run build` |
| DLP scan | BYOV gate, every change |
| Dependency audit | BYOV gate, nightly |

Run the local four together:

```bash
npm run test:unit && npm run lint && npm run typecheck && npm run build
```

## Ship

1. Register the app in the BYOV Control Plane.
2. Connect from your coding tool (Muse, Codex, Claude).
3. Deploy to an admin-approved node (self-hosted Coolify or Vercel).

Keep the repo public-safe: no secrets, env values, logs or real data.
