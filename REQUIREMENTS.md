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
- General: workspace name and default node, validated and persisted
  via the workspace API (`/api/workspace/settings`).
- Nodes: add, edit and remove deployment targets, persisted via the
  workspace API (`/api/workspace/nodes`). New nodes start Pending
  until first contact; nodes with pinned environments cannot be removed.
- Managed nodes feed the dashboard, nodes page, app environments,
  sidebar counts and footer summary.

### Control Plane UI (fourth slice)

- Third-level tab bar on app detail (`/apps/[slug]`): Overview,
  Environments, Deployments, Checks as anchor tabs with scroll-spy,
  sticky under the topbar and sharing anchors with the app rail.
- The app rail keeps its desktop section list; the tab bar is the
  in-content navigation on all sizes and the section navigation on
  small screens.

### Control Plane UI (fifth slice)

- New app flow (`/apps/new`): name, editable slug, multi-line
  description (2000 chars), tech stack and Sandbox node; workspace
  apps persist via the workspace API (`/api/workspace/apps`). Sample apps stay
  read-only and the slug never changes after creation. A blank slug
  derives from the name; an explicit one must be unique lowercase
  labels joined by hyphens. Long descriptions clamp to two lines in
  lists and keep line breaks on the app page.
- Every new app starts with one `sandbox` environment on the chosen
  node, Pending until the first deploy; the five governed checks ride
  along green until the first run proves otherwise.
- The app page guides the owner from scaffold to first Sandbox
  deploy while no deployment exists: pick what to run (a coding
  agent, own code, AI-generated code), then four steps — connect the
  station (Sandbox URL, app, env and node facts; no client, MCP
  endpoint or connect script exists yet), scaffold from the stack
  starter (or the owner's own repo without a stack), start the agent
  / run locally / review the output, keep the gates green and point
  the Coolify FQDN at the Sandbox URL.
- Workspace apps feed the apps list, dashboard, nodes page, sidebar
  counts and the node removal guard; the detail page resolves customs
  client-side and offers removal for workspace apps.
- Creation entry points: the topbar New menu, the apps list, the stacks
  catalog, and each stack detail page ("New app from this stack",
  prefilling the stack via `?stack=`; unknown slugs fall back to the
  first stack).

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
  in `/settings/stacks`; customs persist via the workspace API
  (`/api/workspace/stacks`).
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

### Nodes (second slice)

- Add node is a guided Coolify onboarding flow (see
  `docs/coolify-node.md`): About the server (name, type, location),
  Connect (endpoint plus Test), Serve URLs (domain zone, tailnet
  machine name), each with plain-language help.
- A prerequisites checklist rides with the Add form: server sizing,
  Ubuntu, ports 80/443, DNS for Coolify itself, official install,
  first login and FQDN, then register the endpoint here.
- Endpoint verification runs server-side via POST /api/nodes-test and
  shows DNS → TLS → HTTP evidence plus one actionable guidance line;
  `http` skips TLS by design and any HTTP status counts as reachable.
- Verification never blocks saving: an unreachable endpoint, a failed
  probe, or a missing backend still saves, and the node stays Pending.
- After a successful add the page shows next steps: Pending until
  first contact, set the zone and DNS below, use the Tests to verify.
- Pending tracks adapter contact, not reachability — green Tests with
  a Pending node is the expected steady state until the Coolify node
  adapter lands. The adapter roadmap item stays open: verification is
  not deploying.

### Nodes (third slice): Vercel

- Vercel is a second node kind alongside Coolify: the stack kind id is
  `vercel` (lowercase, in `SUPPORTED_STACK_NODE_KINDS` and the
  per-manifest `nodes` arrays) and the node kind display is `Vercel`.
- Add node is a guided Vercel onboarding flow (see
  `docs/vercel-node.md`): Vercel account and team, project imported
  from the app repo, production URL noted, custom domain via the node
  zone, then register in Settings → Nodes with the same optional
  fields as Coolify (endpoint, domain zone, tailnet machine name —
  left empty, since tailnet URLs need a machine on your tailnet).
- Pending-until-contact semantics match Coolify: new Vercel nodes
  start Pending, probes are advisory-only and never block saving, and
  Pending tracks adapter contact, not reachability.
- The Type picker leads the Add/Edit node form and a per-kind setup
  checklist renders directly beneath it, so the instructions always
  match the selected kind (Coolify keeps its server checklist).
- Stack targeting: `byov-stack`, `ai-chatbot` and `vite-spa` target
  both `coolify` and `vercel` (Next.js and static builds fit Vercel);
  `fastapi-service` stays on `coolify` only — a long-running Python
  service does not fit Vercel serverless.
- URL resolution is unchanged: envs on a Vercel node resolve to
  `https://{app}-{env}.{node-zone}` under the serving node's zone,
  with the custom domain added on the Vercel project.

### Auth (first slice)

- Every route requires a session except `/login`, `/auth/*`,
  `/api/auth/*` and static assets. Pages redirect to `/login?next=…`;
  `/api/*` answers 401. The middleware verifies the session cookie and
  hands the email downstream as `x-byov-user-email`.
- Sessions are stateless HMAC-signed cookies (`byov_session`, 12h,
  HttpOnly, SameSite=Lax, Secure on HTTPS) carrying the user's
  role (admin/member). The signing secret is `AUTH_SECRET`; an unset
  secret falls back to an insecure dev value with a warning.
- Admins come from `AUTH_ADMIN_EMAILS`, plus a first-login bootstrap:
  when no admins are configured anywhere, the first user to sign in
  becomes admin and the claim is a row in Postgres (`auth_bootstrap`,
  atomic so concurrent first logins elect one).
  Role enforcement (RBAC gates) rides a later slice; the session API
  and `x-byov-user-role` already expose the role.
- Default sign-in is passwordless: one request sends a single email
  carrying both a 6-digit code (10-minute TTL, 5 attempts) and a magic
  link (stateless token, 10-minute TTL); the user completes either.
  When only one method is enabled the email carries just that one.
  Request endpoints always answer ok so responses never reveal the
  access list; all endpoints are rate-limited (5/min per key).
- OAuth sign-in via Microsoft Entra ID, GitHub, Google and Apple:
  PKCE S256 for all, state-as-nonce for the OIDC providers, verified
  emails only, failures redirect to `/login?error=…` without details.
  Each provider needs its `AUTH_*_ENABLED` flag plus credentials; the
  callback URLs are `{site}/api/auth/oauth/<provider>/callback`.
- Access is restricted by `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS`
  (exact email wins, then domain; both empty allows all with a warning).
- Outbound mail goes through the default sending account: the
  Settings-saved account (Settings → Email, admin-only, stored in
  Postgres as a single `mail_account` row) wins, else `SMTP_*` env,
  else mail is logged to the console in dev. The Email page shows
  which source is active, saves/clears the account, and can send a
  test email that reports provider errors. A wrong saved account
  breaks sign-in mail; recovery is clearing it on the Email page
  (falls back to env, then console).
- OTP codes and rate limits live in Postgres (`auth_otps`,
  `auth_rate_limits`, atomic attempt counting); `id_token`
  signatures are verified against provider JWKS (RS256, cached
  key sets) in `resolveOAuthIdentity` — see Enterprise hardening.
- Standalone public `/login` page (no shell): one email request sends
  the combined code + link email, the code is entered here with resend
  cooldown, OAuth links for enabled providers, `?next=` deep-link
  preservation and friendly `?error=` copy. With codes off the page
  falls back to a link-only request.
- Settings → Auth: workspace sign-in preferences (methods, provider
  toggles, access lists, session lifetime) persisted via the workspace
  API (`/api/workspace/auth-settings`, admin-only); enforcement stays
  server-side and the UI says so.
- Settings → Users: workspace member list with invite by email, roles
  (admin/member) and last-admin removal/demotion guards, persisted via
  the workspace API (`/api/workspace/users`, admin-only).

### Cell (product direction, decided — not built)

- The "Cell" is BYOV's unit: hosting + live URL, BYOV-managed source
  control, pipeline (push → gates → deploy), env vars/secrets, deploy
  logs, per-change previews, rollback, and audit trail. It positions
  BYOV as a governed app platform, not a hosting provider.
- The vibe-coding loop: the user chats with their coding agent and
  opens the Sandbox URL; nothing runs on their machine. Whether git
  stays invisible (agent-operated) or shows as a guided git-lite flow
  is the end user's own choice, offered by the connector.
- Until the bundle lands, "Sandbox" keeps meaning the environment.
  Build order: control-plane API + token auth → node adapter (Coolify
  app/FQDN/auto-deploy/status/logs) → repo + webhook wiring per app →
  MCP connector with one-snippet agent setup. No MCP endpoint, client,
  or connect script exists yet.

### Cell (slice 1: control-plane API + tokens, built)

- Versioned machine API under `/api/v1/*` for future CLI and MCP
  clients. Auth is `Authorization: Bearer <token>`; browser callers
  may use their session cookie instead (member sessions can read and
  write apps/envs; token management needs a token or an admin
  session).
- Tokens (`lib/api-tokens.ts`): opaque `byov_<id>_<secret>` bearers
  (192-bit secret, WebCrypto-minted like the auth module), stored as
  SHA-256 hashes in Postgres (`api_tokens`) — the secret is
  shown once at issuance and never again. The first token on a fresh
  install issues without credentials (bootstrap, same trust model as
  the first-login admin claim); afterwards issuance needs a token or
  an admin session. Revocation keeps the record with `revokedAt` set.
- Apps and environments (`lib/api-apps.ts`): `GET/POST /api/v1/apps`,
  `GET /api/v1/apps/[slug]`, `GET/POST /api/v1/apps/[slug]/envs`,
  `GET /api/v1/apps/[slug]/envs/[env]`. Validation mirrors the
  browser new-app flow (names, slugs, known stacks and nodes from
  the shipped catalog plus workspace definitions); every app starts
  with one Pending `sandbox` env. State persists as JSONB documents
  in Postgres (`workspace_apps`, the unified store — see below).
  The API serves persisted apps from either creation surface —
  sample apps stay a UI concern.
- Envelope: success is `{ ok: true, data }`; every error is
  `{ ok: false, error }` with an optional per-field `errors` map
  (401 unauthenticated, 403 member managing tokens, 404 unknown
  app/env/token, 400 validation).
- Verified end to end with curl against a production server (issue →
  call → revoke → 401, plus restart persistence):

```sh
BASE=http://localhost:3210
# Bootstrap the first token (fresh data dir only):
curl -X POST $BASE/api/v1/tokens \
  -H 'content-type: application/json' \
  -d '{"name":"ops-laptop"}'
# → {"ok":true,"data":{"id":"…","token":"byov_…",…}} (201; save the token)

TOKEN=byov_<id>_<secret>
curl $BASE/api/v1/apps -H "authorization: Bearer $TOKEN"
# → {"ok":true,"data":[]} (200)

curl -X POST $BASE/api/v1/apps -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Rota Planner","stack":"byov-stack","node":"coolify-frankfurt"}'
# → 201 with slug "rota-planner" and one pending "sandbox" env

curl -X POST $BASE/api/v1/apps/rota-planner/envs \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"staging","node":"coolify-frankfurt"}'
# → 201 {"ok":true,"data":{"name":"staging",…,"status":"pending"}}

curl -X DELETE $BASE/api/v1/tokens/<second-id> \
  -H "authorization: Bearer $TOKEN"
# → 200; calls with the revoked token answer 401 from then on
```

- Still open (later slices): repo and webhook wiring, MCP
  server/CLI, scoped tokens, token UI pages. (Node adapter and
  Coolify writes landed — see Cell slice 2 below.)

### Unified app store (Cell enabler, built)

- `workspace_apps` is the single source of truth for persisted apps.
  Browser creates (`/api/workspace/apps`) and machine-API creates
  (`/api/v1/apps`) read and write the same rows, so an app appears
  on both surfaces immediately; env mutations via `/api/v1` are
  visible in the UI and vice versa. Sample apps remain UI fixtures
  and are never persisted or served by any API.
- Validation is unified in `lib/workspace-store.ts`
  (`createWorkspaceApp`): names/slugs clash against samples plus
  persisted apps, and Sandbox nodes/stacks may be shipped or
  workspace-defined. `lib/api-apps.ts` is a thin `/api/v1` facade
  over that store (same field errors, env rules, Pending Sandbox).
  Concurrent-create slug races return the validation error instead
  of throwing, on both surfaces.
- Migration `0004_unify_apps` backfills any `api_apps`-only rows
  into `workspace_apps` (`ON CONFLICT DO NOTHING` — workspace rows
  win). `api_apps` is retained for rollback but no longer written.

### Cell (slice 2: Coolify node adapter + deploy, built)

- Adapter (`lib/coolify-adapter.ts`): create application, set FQDN,
  deploy, read status, read logs against a Coolify node's endpoint.
  Fetch is injectable for offline unit tests. Tokens come from the
  server environment only (`COOLIFY_API_TOKEN`, per-node
  `COOLIFY_TOKEN_<SLUG>` override) and never enter Postgres or the
  browser. Provider statuses map onto BYOV health
  (`coolifyStatusToHealth`).
- Orchestration (`lib/deploy.ts`): resolves the env URL via
  `lib/dev-urls`, provisions or reuses the Coolify application
  (uuid persisted as `AppEnvironment.providerId`), points its FQDN
  at that URL, triggers the deploy, and records a `Deployment` row
  plus `deploying` env status on the unified store. First success
  flips a Pending workspace node to healthy
  (`touchWorkspaceNode`). Vercel nodes, missing endpoints and
  missing tokens fail with actionable errors.
- API: `POST /api/v1/apps/[slug]/envs/[env]/deploy` (202),
  `GET .../status`, `GET .../logs` — token or session auth via
  `requireApiAuth`; the actor lands on the deployment row.
- UI: every environment card carries a Deploy button; the Sandbox
  guide ship step now describes deploy-from-card instead of manual
  FQDN wiring. Live verification against a real Coolify instance
  (create → deploy → Sandbox URL serves the app) remains the
  acceptance spike — sandbox tests use a fake provider.

### Cell (slice 3: repo + webhook pipeline + audit events, built)

- Repo linkage: apps carry optional `repoUrl`/`branch` (create via
  either API surface, or `POST /api/v1/apps/[slug]/repo`). The app
  page shows the link state. Validation accepts https/git URLs.
- Gates (`lib/gates.ts`): DLP scan runs server-side over pushed
  file contents (private keys, cloud/GitHub tokens, secret
  assignments, committed `.env` files) and never echoes values.
  Unit tests / Lint / Production build / Dependency audit are
  attested per check name by the reporter (connector/CI); missing
  or failed attestation fails closed. Fresh results persist on the
  app — checks are no longer static green labels.
- Pipeline (`lib/pipeline.ts` + `POST /api/v1/apps/[slug]/webhook`,
  token/session or `x-byov-webhook-secret`): evaluates gates,
  persists them, deploys the target env (default `sandbox`) only
  on full pass via the slice-2 adapter.
- Audit/activity: migration `0005_events` + `lib/events.ts`.
  App registration, gate pass/block and deploys record persisted
  events; `GET /api/workspace/activity` serves them and the
  dashboard + `/activity` prefer them over the sample feed once
  any exist. Isolated server-side check runner (checkout + exec)
  remains a follow-up — reporters attest command gates today.

### Cell (slice 4: CLI + MCP connector + scoped tokens, built)

- Scoped tokens (migration `0006_token_scopes`): tokens carry
  `apps:read` / `apps:write` / `tokens:manage`; `/api/v1` app reads
  need `apps:read`, writes/deploys/webhooks need `apps:write`, and
  token management needs `tokens:manage` (or an admin session).
  Pre-scope tokens (no scopes stored) keep full access so existing
  connectors keep working. Settings → API tokens lists, creates
  (secret shown once) and revokes tokens.
- Connector core (`lib/cli-core.ts`, `lib/mcp-tools.ts`): typed
  `/api/v1` client plus CLI commands (apps, create, link, deploy,
  status, logs) and five MCP tools (list/create/deploy/status/
  logs), all unit-tested with a fake fetch.
- Entries with no new dependencies: `cli/byov.mjs` (BYOV_URL +
  BYOV_TOKEN) and `mcp/byov-mcp.mjs` (stdio JSON-RPC; one-snippet
  agent config in its header). The Sandbox guide connect step now
  describes this one-time setup instead of a manual loop.

### Cell (slice 5: vars, previews, rollback, built)

- Per-env vars/secrets (`AppEnvironment.envVars`, `lib/cell.ts`):
  `GET .../envs/[env]/vars` returns keys with masked values only;
  `PUT` replaces the set (validated names). Deploys push vars to
  the provider (`setApplicationEnvVars`) before triggering. Env
  cards list var keys, never values. Values persist in the app
  document — vault/KMS encryption remains a hardening follow-up.
- Previews: `POST /api/v1/apps/[slug]/previews {branch}` creates
  (or redeploys) a `preview-<branch>` env on the Sandbox node and
  deploys it; URLs resolve through the same dev-URL contract.
  Preview SSO protection rides the enterprise-hardening slice.
- Rollback: `POST .../envs/[env]/rollback {deploymentId?}`
  redeploys the provider app, records the rollback in the audit
  trail, and refuses unprovisioned envs or unknown deployments.

### Enterprise hardening (built)

- RBAC enforcement: workspace writes for nodes, stacks and
  settings now require an admin session (`requireWorkspaceAdmin`);
  reads stay session-level, and app creation stays open to members
  (citizen developers). Users and auth settings were already
  admin-only. Members get 403 with an actionable message.
- Audit + SIEM: persisted events (slice 3) are exportable via
  `GET /api/v1/audit` (token managers / admin sessions, newest
  200) and stream to `BYOV_SIEM_WEBHOOK_URL` when set — every
  recorded event POSTs as JSON (`{source:"byov", …}`); delivery is
  best-effort and the Postgres row remains the record.
- OIDC hardening: `lib/jwks.ts` verifies `id_token` RS256
  signatures against the issuer JWKS (Google/Apple/Entra URLs,
  `kid` selection, hourly cache, fail-closed). `resolveOAuthIdentity`
  requires claims + signature before minting a session; GitHub
  keeps its verified-email API flow.
- Still open for a full enterprise launch: SCIM/group sync,
  promotion approvals (Sandbox → production), preview SSO,
  vault-grade secret encryption, and an isolated server-side
  check runner. These are tracked decisions, not silent gaps.

### Node API tokens (Settings → Nodes, built)

- Coolify nodes carry a provider API token, configured in the node
  form (Settings → Nodes → Manage): create the token in Coolify
  (Keys & Tokens / API tokens, manage-applications permission),
  paste it into Coolify API token, and verify with Test token
  (`POST /api/workspace/nodes/verify-token`, admin-only,
  authenticated read against the node). The setup checklist in
  the form and the next-steps panel walk through it.
- Storage: migration `0007_node_credentials` +
  `lib/node-credentials.ts`. Tokens are AES-256-GCM ciphertext
  (AUTH_SECRET-derived key) in `workspace_node_credentials`,
  apart from public node documents. APIs and cards only expose
  `Node.hasApiToken`; blank edit keeps the token, explicit clear
  removes it, node delete removes it. Deploys resolve saved token
  → `COOLIFY_TOKEN_<SLUG>` → `COOLIFY_API_TOKEN` (`resolveNodeToken`)
  and the missing-token error now points at Settings → Nodes.
- Docs + gate: the in-app guide **Set up a Coolify node**
  (`/docs/coolify-node`, `docs/coolify-node-setup.md`) is linked
  from the node-form setup checklist. Creating a node requires a
  passing connection test for the exact values entered — Test
  token for Coolify, endpoint Reachable for Vercel — enforced in
  `NodeForm` (`requireConnectionTest` on the Add form; edits stay
  ungated). Changing endpoint or token revokes the pass.

### Database (first slice)

- All Control Plane server state lives in Postgres: API tokens
  (`api_tokens`), persisted apps (`workspace_apps`, one JSONB
  document per app; `api_apps` is the pre-unification table kept
  for rollback), the auth bootstrap claim (`auth_bootstrap`, single row), the
  saved mail account (`mail_account`, single row), OTP codes
  (`auth_otps`) and rate-limit hits (`auth_rate_limits`), plus
  workspace state (nodes, apps, stacks, users as JSONB documents;
  settings and auth settings as `workspace_kv` rows) served through
  the session-authed `/api/workspace/*` API (users and auth settings
  are admin-only). Sample data stays a UI fallback and is never
  served by any API.
- Postgres is required: the server fails fast when `DATABASE_URL` is
  unset or not a postgres URL. There is no file-store fallback; the
  old `AUTH_DATA_DIR` / `BYOV_DATA_DIR` JSON stores are gone.
- Access goes through `lib/db.ts` (pool singleton, parameterized
  `query` / `queryOne`, lazy migrate-once, Node-only — never Edge or
  client). Migrations are self-registering `db/migrations/NNNN_*.ts`
  modules applied in name order and tracked in `schema_migrations`;
  landed migrations are never edited. Details in `docs/database.md`.
- Unit tests never need a live database (`vi.mock("@/lib/db")`), so
  `npm run test:unit` stays green in a clean environment.
- Task previews need a Postgres `DATABASE_URL` to boot; the preview
  adapter still sets a sqlite URL and is a known follow-up.
