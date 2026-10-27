# BYOV

A Next.js application with React, TypeScript, Tailwind CSS and Vitest.

## Development

```bash
npm ci
npm run dev
```

The development script uses the port assigned when the project was created.
Use the local address shown in Vibe Factory when working in its managed checkout.
For a standalone clone, open localhost at the port shown by the development server.
Copy `.env.example` to `.env.local` when configuring application variables.

## Checks

```bash
npm run test:unit
npm run lint
npm run typecheck
npm run build
```

Vibe Factory runs tests and builds locally against committed snapshots. The
template creates no GitHub Actions workflows and consumes no hosted Actions
minutes. See the workspace's Settings → Local checks for automatic check results.

## Public source and private context

This repository contains application code, tests, redistributable assets, setup
instructions and public product requirements in `REQUIREMENTS.md`.
Treat README, requirements, agent instructions, commits and pull requests as public.

Factory stores the private creation brief and stack-specific agent context outside
this repository, in its ignored `config/project-private/<project>/brief.md` store.
Factory task sessions receive a pinned private copy as input, never as a source file.
Keep original research, inspirations, strategy and internal notes in a separate
private workspace with its own backup. Ignore rules also protect conventional
private folders, runtime logs, databases, credentials and environment files.
Ignore rules do not remove files that were already committed.

## Factory integration

The managed source checkout has local-only `config/project.json`,
`config/environments.json`, `config/operations.json` and `config/deploy.json` files.
Factory uses them for assigned ports, environment destinations and operation status;
they are excluded from Git and container build contexts. They are not required to
build or run a standalone clone. Do not commit copies containing real host settings.

Use Factory for local controls, provisioning, previews and releases through Coolify.
In task worktrees, use the pinned Factory handoff when local configuration is absent.
Production releases require the configured Delivery approval. Code integration does
not authorize Ship or Promote. Deployment and preview adapters live in `deploy/`.
