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

### Tech stacks (first slice)

- Stack catalog (`stacks/`): one folder per stack with `manifest.json`,
  setup `README.md` and stack `blueprint.md`.
- Registry (`lib/stacks.ts`): typed list/get over the manifests; checks
  mirror the Control Plane required gates.
- Catalog UI (`/stacks`, `/stacks/[slug]`): browse stacks, gates,
  scaffold steps and node targets.
- First stack `byov-stack`: the same Next.js + React + TypeScript +
  Tailwind + Vitest stack BYOV is built on; versions track `package.json`.
- Adding a stack = new folder + manifest + registry entry + tests; no
  new dependencies.

### Tech stacks (second slice)

- Workspace stacks: define, clone, edit and remove custom stacks
  in `/settings/stacks`; customs live in the browser until the API lands.
- Shipped manifests stay the read-only catalog; cloning one starts an
  editable workspace copy, and the slug never changes after creation.
- Gates stay governed: customs inherit the five required gate names and
  only adapt the test/lint/build commands per stack.
- New draft stacks covering popular vibe-code scenarios: `ai-chatbot`
  (Next.js + AI SDK), `vite-spa` (client-only dashboards) and
  `fastapi-service` (Python APIs and automations).

### Tech stacks (third slice)

- Layers carry a category (frontend, server, database, language,
  testing, quality, runtime, ai); the detail page groups by category.
- The stack form edits category, label and value per layer; customs
  saved before the taxonomy migrate with best-effort categories.

### Dev URLs (first slice)

- Every environment resolves to `https://{app}-{env}.{node-zone}` under its
  serving node's wildcard zone; one `*.zone` DNS record per node covers all
  its envs.
- An explicit env URL always wins as an override; envs on zoneless nodes show
  a "set a domain zone" state instead of a dead link.
- Optional workspace dev zone (e.g. `dev.byov.xexo.io`) gives development
  envs on the zone-serving node short `{app}.{dev-zone}` URLs, and warns when
  a dev env sits elsewhere.
- Pure resolver in `lib/dev-urls.ts` (slugify, 63-char labels, zone checks);
  the future node adapter reuses it when programming Coolify.
- Preview URLs per branch/PR with protection land in a later slice.

Operator runbook (public, per node):

1. Create an `A` record for `*.{node-zone}` pointing at the node.
2. On the Coolify node, configure the Traefik DNS challenge and request a
   wildcard certificate for the zone (Coolify docs: Proxy → Wildcard
   Certificates).
3. Set each app's Coolify FQDN to the URL the control plane shows; Coolify
   provisions TLS automatically from there.

### Dev URLs (second slice)

- Each node serves one DNS scenario: public subdomain, Tailscale, or local
  DNS; envs inherit their node's scenario.
- Public keeps the first-slice pattern; local renders the same shape under an
  operator zone on the internal resolver (`.local` and `home.arpa` are
  rejected — mDNS and home-network scope, not org servers).
- Tailnet renders `https://{machine}.{tailnet}.ts.net:{port}`: one node name
  (Tailscale mints no per-service subdomains) with a stable deterministic
  port per env; TLS comes from `tailscale cert` on the node.
- The dev-zone short variant stays public-only; explicit URL overrides still
  win everywhere.
- No real tailnet names ship in the repo or sample data; the tailnet domain
  is workspace config.

Operator runbook (local, per node):

1. Serve `*.{node-zone}` from the internal resolver to the node's LAN IP.
2. Issue node certificates from the org private CA (ACME-capable preferred),
   trust the CA on clients, and terminate TLS in the node's proxy.
3. Set each app's Coolify FQDN to the URL the control plane shows.

Operator runbook (tailnet, per node):

1. Enable MagicDNS and HTTPS certificates in Tailscale Admin → DNS.
2. Run `tailscale cert {machine}.{tailnet}.ts.net` on the node and load the
   certificate into the node's proxy (Traefik file provider or equivalent).
3. Point the proxy's per-env ports at the apps; BYOV shows each env's URL
   with its stable port.

### Dev URLs (third slice)

- Scenario selection moves up a layer and replaces the per-node scenario
  flag: a workspace default (Settings → DNS) with per-app overrides on each
  app page. Nodes just provide materials — a zone, a tailnet machine name —
  and serve whatever apps select.
- The DNS page holds the default scenario picker plus the dev zone and
  tailnet domain; per-app pickers inherit the default unless changed.
- Env cards resolve through app override → workspace default → public
  fallback, with setup guidance instead of dead links.

### Dev URLs (fourth slice)

- Settings → DNS groups one setup card per scenario: public (dev zone),
  Tailscale (tailnet domain), local (bootstrap guide). Nodes keep zone and
  machine-name values.
- Live tests run server-side via POST /api/dns-test in DNS → TLS → HTTP
  stages with evidence: zone rows probe `byov-probe.{zone}`, tailnet rows
  probe the machine name, env cards probe their resolved URLs. Results
  reflect the BYOV server's network view.
- The endpoint only probes well-formed multi-label hostnames on 443 or the
  tailnet port range; broader hardening rides with the Auth/RBAC slice.

Local bootstrap runbook:

1. Resolver: point clients and the BYOV server at an internal resolver —
   router DNS, dnsmasq, CoreDNS, or Pi-hole — serving `*.{node-zone}` to
   the node's LAN IP.
2. CA: run step-ca (or an equivalent ACME server) for node certificates;
   mkcert only covers a single admin machine.
3. Trust: install the CA root on every client and on the BYOV server, then
   verify with the Nodes-row Test before pointing apps at local URLs.
