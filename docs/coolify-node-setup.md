---
title: "Set up a Coolify node"
description: "From a running Coolify instance to a verified BYOV node: endpoint, API token, connection test, zone, and first deploy."
---

# Set up a Coolify node

A **node** is where your apps run. This guide takes one Coolify
instance from "installed and reachable" to a verified BYOV node that
can take its first deploy. It assumes Coolify itself is installed,
you can log in to its panel, and BYOV is open in
**Settings → Nodes**.

For the full bare-metal runbook (server sizing, install script,
wildcard certificates, troubleshooting), see
`docs/coolify-node.md` in the repository.

## What you need

- The Coolify panel URL, e.g. `https://panel.example.com`.
- Permission in Coolify to create API tokens.
- A domain zone for app URLs, e.g. `apps.example.com`, with control
  of its DNS (optional for saving, required for public Sandbox URLs).

## 1. Create the API token in Coolify

BYOV talks to Coolify over its API: it creates the application for
each environment, sets its FQDN to the BYOV URL, stores env vars,
and triggers deploys. That needs a token:

1. Log in to the Coolify panel.
2. Open **Keys & Tokens / API tokens** and create a new token for
   BYOV with read, write and deploy permissions.
3. Copy the token now — Coolify shows it once. Treat it like a
   password: never commit it or paste it into chat or tickets.

## 2. Register the node in BYOV

Go to **Settings → Nodes → New node** and fill in:

| Field | What to enter |
|---|---|
| Name | Stable display name, e.g. `contabo-01`. The slug derives from it and never changes. |
| Location | Where the server lives, e.g. `Munchen`. |
| Endpoint | The Coolify panel URL. This is where BYOV reaches the node. |
| Coolify API token | The token from step 1. BYOV encrypts it on the server and never shows it again. |
| Domain zone | The zone for app URLs **without** the `*.` prefix, e.g. `apps.example.com`. |

## 3. Pass the connection test (required)

A new node can only be created after its connection test passes
for the exact endpoint and token you entered:

1. Press **Test** and confirm DNS, TLS, and HTTP all answer.
2. Press **Test token** and confirm **Token OK**. This makes one
   authenticated read from the BYOV server, so it proves the
   token works from where deploys will run. For an existing node,
   a passing test is first contact: **Pending flips to healthy
   right away**, no deploy needed.
3. Press **Add node**. Changing the endpoint or token after a
   passing test means testing again.

Editing an existing node does not require a fresh test, but run
**Test token** after any endpoint or token change.

## 4. Point DNS at the node

Sandbox URLs look like `https://{app}-sandbox.{zone}`:

1. Create a `*.{zone}` record (usually `A`) pointing at the node.
2. In **Settings → Nodes → DNS setup**, run the Test for this node
   and confirm DNS, TLS, and HTTP pass.
3. Until the zone is set, the card shows **Environments —** and no
   app URL can be served. That is expected, not an error.

## 5. Take the first deploy

1. Register an app in **Apps → New app** and pin its Sandbox to
   this node.
2. Link the app's Git repo (and branch) — without one there is
   nothing for Coolify to build. Private GitHub repos also need
   a GitHub App with repo access in Coolify (see
   `docs/coolify-node.md`).
3. Open the app and press **Deploy** on the Sandbox card.
4. The Sandbox URL opens the app (the node is already healthy
   from its passing token test, or flips on this deploy).

## If the test fails

| Symptom | Likely cause | Fix |
|---|---|---|
| Token rejected (401/403) | Wrong, revoked, or under-scoped token | Create a fresh token in Coolify with read, write and deploy permissions and paste it again. |
| Deploy: **No repository linked yet** | The app has no repo URL | Open the app page and link its Git repo, then deploy again. |
| DNS fails | Endpoint hostname typo or record not propagated | Check spelling, verify with `dig`, wait out the TTL. |
| TLS fails | Certificate missing or wrong name | Finish Coolify's own FQDN/certificate setup so the panel URL serves valid TLS. |
| Timeout or refused | Coolify down, or ports 80/443 blocked | Check the Coolify service and the firewall/security group. |

## Keeping it healthy

- Rotate the token in Coolify, then paste the new one with
  **Manage** on the node card and re-run **Test token**.
- The node card shows **API token: Saved** once a token is stored.
  **Missing — Manage to add** means deploys will refuse until one
  is saved.
- Revoking the token in Coolify breaks deploys immediately; BYOV
  keeps the audit trail of what ran while it was valid.
