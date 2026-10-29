# AI Chatbot tech stack

Next.js 16 (App Router) + Vercel AI SDK 5 + Tailwind CSS 4 starter for
support copilots and internal assistants. Streaming chat UI, server-side
provider keys, Control Plane gates from the first commit.

## Scaffold

1. Copy the file tree in [blueprint.md](blueprint.md) into a new repo.
2. `npm ci`
3. `cp .env.example .env.local` and add your provider key.
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

Keep the repo public-safe: no secrets, provider keys, logs or real data.
Provider keys live in server routes and node env vars only — the DLP gate
fails the build if one leaks into the client bundle or the repo.
