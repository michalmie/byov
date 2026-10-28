# Adding a Coolify node

End-to-end operator runbook: from a bare server to a verified node in
BYOV Settings → Nodes. All hostnames below are placeholders — substitute
your own domains.

Overview:

1. [Provision the server](#1-provision-the-server)
2. [Install Coolify](#2-install-coolify)
3. [Point DNS at Coolify and log in](#3-point-dns-at-coolify-and-log-in)
4. [Wildcard zone and certificate](#4-wildcard-zone-and-certificate)
5. [Register the node in BYOV](#5-register-the-node-in-byov)
6. [Verify](#6-verify)
7. [Troubleshooting](#7-troubleshooting)

## 1. Provision the server

- **OS:** a recent Ubuntu LTS with SSH access for an admin user.
- **Sizing (starting point):** 2 vCPU, 4 GB RAM, 30 GB disk. Grow with
  the apps you plan to host; check the
  [Coolify docs](https://coolify.io/docs) for current minimums.
- **Network:** the server needs inbound **80/tcp and 443/tcp** open
  (Coolify's Traefik proxy serves apps and answers ACME challenges
  there) plus SSH for administration. Outbound HTTPS must reach the
  public internet for installs and certificate issuance.
- Pick the Coolify FQDN now, e.g. `coolify.example.com`. You will point
  DNS at it in step 3.

## 2. Install Coolify

1. SSH into the server and run the official install script from the
   [Coolify docs](https://coolify.io/docs). The script installs Docker
   and starts Coolify behind its built-in Traefik proxy.
2. Confirm Coolify listens on the server itself before touching DNS:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000
   ss -tln | grep -E ':80|:443'
   ```

   Any HTTP status from Coolify counts — it proves the service is up.
   Ports 80/443 must be listening for public traffic and TLS.

## 3. Point DNS at Coolify and log in

1. Create an `A` record for the Coolify FQDN pointing at the server's
   public IP:

   ```
   coolify.example.com.  A  203.0.113.10
   ```

2. Wait for the record to propagate, then open
   `https://coolify.example.com` in a browser.
3. Complete the **first login**: create the root admin account and set
   Coolify's own FQDN to `coolify.example.com` when asked. Coolify
   provisions its dashboard certificate automatically from there.

## 4. Wildcard zone and certificate

Apps on this node get `https://{app}-{env}.{node-zone}` URLs, served
from one `*.{node-zone}` record plus one wildcard certificate in
Traefik. In short:

1. Choose the node's zone, e.g. `apps.example.com`.
2. Create `*.apps.example.com` as an `A` record pointing at the node.
3. In Coolify, configure the Traefik DNS challenge and request a
   wildcard certificate for the zone.

The authoritative per-scenario steps (public, tailnet, local DNS) live
in the **Dev URLs runbooks in `REQUIREMENTS.md`** — follow those for
your setup instead of duplicating them here. If this node serves a
tailnet or local scenario, do that scenario's runbook first, then come
back to register the node.

## 5. Register the node in BYOV

Go to **Settings → Nodes → New node**. The form is grouped in three
sections; every field is explained in place.

### About the server

| Field      | What to enter |
|------------|---------------|
| **Name**   | Display name, e.g. `frankfurt-02`. The node slug derives from it and never changes, so pick a stable name. |
| **Type**   | `Coolify (self-hosted)` — the only type that deploys apps today. |
| **Location** | Where the hardware lives — a city, site, or lab, e.g. `Frankfurt`. |

### Connect

| Field        | What to enter |
|--------------|---------------|
| **Endpoint** (optional) | The Coolify dashboard URL you logged into in step 3, e.g. `https://coolify.example.com`. This is where the control plane will reach the node. |

Press **Test** next to the endpoint (see [Verify](#6-verify)) before
saving. A failing test never blocks saving — the node simply stays
Pending until it is reachable.

### Serve URLs

| Field | What to enter |
|-------|---------------|
| **Domain zone** (optional) | The zone from step 4 **without** the `*.` prefix, e.g. `apps.example.com`. Leave empty only if this node serves no public or local env URLs. |
| **Tailnet machine name** (optional) | The machine name as known on the tailnet, e.g. `frankfurt-02`. Needed only for the Tailscale scenario; the tailnet domain itself is set in Settings → DNS. |

Press **Add node** to save. The page then shows next steps: the node is
Pending until first contact, the zone needs its DNS record (step 4),
and the Tests below confirm each part.

## 6. Verify

All tests run **from the BYOV server**, so results reflect its network
view, not your laptop's.

- **Endpoint Test** (in the Add/Edit form): probes the Coolify
  endpoint in DNS → TLS → HTTP stages. `https` endpoints get all
  three stages; plain `http` skips TLS by design. Any HTTP status
  counts as reachable — the probe only needs the server to answer.
- **DNS Tests** (Settings → Nodes → DNS setup): one Test per zoned
  node probes `byov-probe.{zone}`; tailnet rows probe the machine
  name. These confirm app URLs will resolve and present valid TLS.
- **Pending until first contact:** every new node shows **Pending**.
  That is normal — it means BYOV has not reached the node yet. The
  status clears once the node adapter makes first contact. A node can
  be Pending with green Tests: the Tests prove the network path, the
  status tracks adapter contact.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Endpoint Test: **DNS fails** | Hostname typo, or the `A` record is missing / not propagated | Re-check the endpoint spelling; verify the record with `dig coolify.example.com`; wait out the TTL |
| Endpoint Test: **TLS fails** | Certificate missing, expired, wrong name, or privately issued | Finish step 3 so Coolify provisions its cert; check the FQDN matches; for private CAs, trust the root on the BYOV server |
| Endpoint Test: **refused or timeout** | Coolify not listening, or ports 80/443 blocked | Re-run the step-2 checks on the server; open 80/443 in the firewall / security group |
| DNS Test: `byov-probe.{zone}` fails | Wildcard record missing or pointing elsewhere | Re-run the step-4 record; confirm with `dig random123.apps.example.com` |
| Node stuck **Pending** | Expected until the node adapter lands — verification is not deployment | Confirm the endpoint and DNS Tests pass; the status clears on first adapter contact, no operator action needed |
| Test button unavailable | No endpoint entered yet | Fill in the endpoint; the button enables once there is something to probe |

If every Test passes and the node is still Pending, there is nothing
to fix — Pending tracks adapter contact, not reachability.
