# Project instructions

Extend this project's installed Next.js App Router, React, TypeScript, Tailwind CSS
and Vitest stack. Read README.md and the public scope in REQUIREMENTS.md first.

## Publication boundary

This repository is suitable for public publication. Keep research, inspirations,
strategy, original private briefs and internal discussions in a separate private
workspace. Never copy private Factory input into source files, requirements,
comments, commit messages or pull request reports. Only publish approved product
requirements and implementation details needed to understand the application.
Do not commit secrets, environment values, runtime logs or real database contents.

## Factory integration

The managed source checkout owns local-only config/project.json,
config/environments.json, config/operations.json and config/deploy.json.
Factory reads these files and calls deploy scripts by convention. Preserve their
local values and assigned port when present; do not recreate them in a task
worktree just to commit them. Use Factory's pinned handoff in isolated sessions.

Use the dashboard to start, stop, test, provision and deploy so results stay visible.
Never invent operation history. Configure secrets through environment files or
Factory. Preserve the deploy and preview adapters.

Run npm run test:unit for meaningful behavior changes, npm run lint,
npm run typecheck and npm run build before completion. Report checks actually run.

Follow the configured task and PR workflow. The trusted Factory controller owns
GitHub publication in sandboxed task sessions. Keep unfinished work in draft;
completed, checked and reviewed changes can be integrated under the configured
policy. Production release remains a separate approved Delivery action.

<!-- factory:delivery:start -->
## Factory delivery

Read [deployment handoff](config/FACTORY-DELIVERY.md) before preparing a release.
Production requires the operator’s explicit release approval in Factory: Ship, Promote, or Approve agent deployment.
<!-- factory:delivery:end -->
