# BYOV Requirements

This file is the repo-owned source of truth for evolving product requirements.

## Working Rules

- Commit all meaningful project changes to git.
- Push commits to the linked GitHub repository to preserve rollback history.
- Keep automatic unit tests current as the codebase evolves.
- Use `npm run test:unit` as the standard unit-test command.
- Treat commit history as the primary rollback mechanism for code changes.

## Product Requirements

### Vision

BYOV (Bring Your Own Vibe) empowers employees to fix the issues and challenges
they face at work by providing solutions that help them with their daily jobs.
It goes beyond corporate blockers for vibe-coded apps by providing a secure
framework in which citizen-developed applications can be built, governed and
deployed.

### Architecture

The solution has three parts:

- **Control Plane**: the central UI to control everything — creating apps,
  managing environments, deployment, security, DLP, SIEM, audit trails and RBAC.
- **Nodes**: deployment targets. Administrators decide where apps are deployed
  and in which environments. The first supported node type is a self-hosted
  Coolify instance.
- **Client**: the way an employee or citizen developer connects to an app
  directly from coding tools such as Muse, Codex, Claude and similar.

### Control Plane UI (first slice)

- App shell with workspace navigation, app shortcuts and breadcrumb topbar.
- Dashboard (`/`): fleet figures, app health table, nodes and activity.
- Apps (`/apps`) and app detail (`/apps/[slug]`):
  environments, deployments and required checks per app.
- Nodes (`/nodes`): deployment targets and the apps pinned to each.
- All figures come from a sample dataset until the API lands; the UI labels
  it as sample data.

### Control Plane UI (second slice)

- Three navigation levels: workspace rail with counts (L1), app rail
  with scroll-spy section anchors (L2), page content (L3).
- Environment cards with URL, node, status, last deploy and checks.
- Global activity feed (`/activity`), shared with the dashboard.

### Control Plane UI (third slice)

- Settings (`/settings`) with section navigation: General and Nodes.
- General: workspace name and default node, validated and kept in the
  browser until the API lands.
- Nodes: add, edit and remove deployment targets. New nodes start Pending
  until first contact; nodes with pinned environments cannot be removed.
- Managed nodes feed the dashboard, nodes page, app environments,
  sidebar counts and footer summary.
