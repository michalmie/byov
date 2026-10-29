# Adding a Vercel node

End-to-end operator runbook: from a Vercel account to a verified node in
BYOV Settings → Nodes. All team, project and domain names below are
placeholders — substitute your own.

Overview:

1. [Create the Vercel account and team](#1-create-the-vercel-account-and-team)
2. [Import the project from the repo](#2-import-the-project-from-the-repo)
3. [Note the production URL](#3-note-the-production-url)
4. [Custom domain via the node zone](#4-custom-domain-via-the-node-zone)
5. [Register the node in BYOV](#5-register-the-node-in-byov)
6. [Verify](#6-verify)
7. [Troubleshooting](#7-troubleshooting)

## 1. Create the Vercel account and team

1. Sign up at [vercel.com](https://vercel.com) and create a team for
   company apps, e.g. `acme-team`. One team per cost center keeps
   usage and access reviewable.
2. Connect the team's git provider (GitHub, GitLab or Bitbucket) so
   projects can import repos directly.
3. Decide who may add projects: team owners approve new imports, the
   same way server admins approve new Coolify apps.

No server to provision, no ports to open — Vercel runs the platform;
you only bring the account and the team.

## 2. Import the project from the repo

1. In the Vercel dashboard pick **Add New → Project** and import the
   app's repository, e.g. `acme-team/my-app`. One Vercel project per
   BYOV app keeps deploys and domains separate.
2. Keep the auto-detected framework preset (Next.js, Vite, or static)
   and confirm the build settings: build command, output directory
   and install command.
3. Add the project's environment variables in Vercel — production
   values live there, never in the repo. Never commit secrets.
4. Deploy. The first production deploy mints the production URL used
   in step 3.

## 3. Note the production URL

After the first deploy Vercel shows a production URL such as:

```
https://my-app-acme-team.vercel.app
```

Open it and confirm the app renders. Note the URL — you will enter it
as the endpoint when registering the node in step 5. (The project
dashboard URL, e.g. `https://vercel.com/acme-team/my-app`, works as
the endpoint too.)

## 4. Custom domain via the node zone

Apps on this node get `https://{app}-{env}.{node-zone}` URLs, served
from the zone you register on the node. In short:

1. Choose the node's zone, e.g. `apps.example.com`.
2. In the Vercel project go to **Settings → Domains** and add the
   domain the control plane shows for each env (or the zone's wildcard
   `*.apps.example.com` on a plan that supports it).
3. Create the DNS records Vercel shows — an `A` record or a `CNAME` to
   Vercel's edge — at your DNS provider. Vercel provisions the TLS
   certificate automatically once the records resolve.

The authoritative per-scenario steps (public, tailnet, local DNS) live
in the **Dev URLs runbooks in `REQUIREMENTS.md`** — follow those for
your setup instead of duplicating them here. Note the Tailscale
scenario does not apply to Vercel nodes: tailnet URLs need a machine
on your tailnet, and Vercel projects are not on it.

## 5. Register the node in BYOV

Go to **Settings → Nodes → New node**. The form is grouped in three
sections; every field is explained in place.

### About the account

| Field      | What to enter |
|------------|---------------|
| **Name**   | Display name, e.g. `vercel-cloud`. The node slug derives from it and never changes, so pick a stable name. |
| **Type**   | `Vercel (cloud)` — apps deploy through Vercel cloud projects. |
| **Location** | Where the workloads run, e.g. `Vercel cloud`. A region hint such as `Vercel cloud (iad)` helps when you run several nodes. |

### Connect

| Field        | What to enter |
|--------------|---------------|
| **Endpoint** (optional) | The production URL from step 3, e.g. `https://my-app-acme-team.vercel.app`. This is where the control plane will reach the node. |

Press **Test** next to the endpoint (see [Verify](#6-verify)) before
saving. A failing test never blocks saving — the node simply stays
Pending until it is reachable.

### Serve URLs

| Field | What to enter |
|-------|---------------|
| **Domain zone** (optional) | The zone from step 4 **without** the `*.` prefix, e.g. `apps.example.com`. Leave empty only if this node serves no public or local env URLs. |
| **Tailnet machine name** (optional) | Leave empty — the Tailscale scenario needs a machine on your tailnet (see step 4). |

Press **Add node** to save. The page then shows next steps: the node is
Pending until first contact, the zone needs its DNS record (step 4),
and the Tests below confirm each part.

## 6. Verify

All tests run **from the BYOV server**, so results reflect its network
view, not your laptop's.

- **Endpoint Test** (in the Add/Edit form): probes the production URL
  in DNS → TLS → HTTP stages. `https` endpoints get all three stages;
  plain `http` skips TLS by design. Any HTTP status counts as
  reachable — the probe only needs the server to answer.
- **DNS Tests** (Settings → Nodes → DNS setup): one Test per zoned
  node probes `byov-probe.{zone}`. These confirm app URLs will resolve
  and present valid TLS.
- **Pending until first contact:** every new node shows **Pending**.
  That is normal — it means BYOV has not reached the node yet. The
  status clears once the node adapter makes first contact. A node can
  be Pending with green Tests: the Tests prove the network path, the
  status tracks adapter contact.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Endpoint Test: **DNS fails** | URL typo, or the project was renamed or deleted | Re-check the endpoint spelling against step 3; confirm the project still exists in the Vercel dashboard |
| Endpoint Test: **TLS fails** | Custom-domain certificate still provisioning, or wrong name | Wait for Vercel to issue the cert after step 4; check the domain matches the project settings |
| Endpoint Test: **refused or timeout** | Wrong URL, project suspended, or Vercel incident | Open the URL in a browser; check the project status and the [Vercel status page](https://www.vercel-status.com) |
| DNS Test: `byov-probe.{zone}` fails | Domain not added in Vercel, or DNS records missing | Finish step 4: add the domain in the project settings, then create the records Vercel shows |
| Node stuck **Pending** | Expected until the node adapter lands — verification is not deployment | Confirm the endpoint and DNS Tests pass; the status clears on first adapter contact, no operator action needed |
| Test button unavailable | No endpoint entered yet | Fill in the endpoint; the button enables once there is something to probe |

If every Test passes and the node is still Pending, there is nothing
to fix — Pending tracks adapter contact, not reachability.
