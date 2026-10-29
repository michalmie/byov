---
title: "Sign in with Microsoft Entra ID"
description: "Register BYOV as an Entra app registration and configure AZURE_AD_* credentials for OAuth sign-in."
---

# Sign in with Microsoft Entra ID

## What it enables

Users sign in to BYOV with their Microsoft work, school, or personal
account. The login page shows a **Microsoft Entra ID** button that runs
an OIDC authorization-code flow with PKCE against
`https://login.microsoftonline.com/{tenant}/v2.0`. Requested scopes:
`openid profile email`. The verified identity email becomes the BYOV
account email (still subject to the allowlist).

## Prerequisites

- A Microsoft Entra tenant with permission to create app registrations
  (Application Developer role or similar).
- Portal: [Microsoft Entra admin center → App
  registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
  (or the [Azure portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)).
- Decide the account audience up front: single tenant (your
  organization only) or multi-tenant (`common`, `organizations`, or
  `consumers`). This choice becomes `AZURE_AD_TENANT_ID`.

## Register the application

1. Open **App registrations** → **New registration**.
2. **Name**: anything recognizable, for example `BYOV`.
3. **Supported account types**: pick the audience you decided on:
   - *Single tenant* — only your organization; use your tenant ID
     (GUID or domain) as `AZURE_AD_TENANT_ID`.
   - *Multitenant* variants — use `common`, `organizations`, or
     `consumers` as `AZURE_AD_TENANT_ID`.
4. **Redirect URI**: platform **Web**, value exactly:

   ```text
   {NEXT_PUBLIC_SITE_URL}/api/auth/oauth/entra/callback
   ```

   Local development example:

   ```text
   http://localhost:3000/api/auth/oauth/entra/callback
   ```

   The server computes this with `getOAuthRedirectUri`
   (`resolveRequestOrigin` + route path); `NEXT_PUBLIC_SITE_URL` wins,
   so register whatever it is set to in each environment.
5. Click **Register** and copy from the **Overview** page:
   - **Application (client) ID** → `AZURE_AD_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_AD_TENANT_ID` (or keep
     `common` for multi-tenant)
6. Go to **Certificates & secrets** → **Client secrets** → **New client
   secret**, add a description and expiry, then copy the secret
   **Value** (not the Secret ID) → `AZURE_AD_CLIENT_SECRET`. It is
   shown only once.
7. No API-permission changes are needed: `openid profile email` are
   standard OIDC scopes requested at authorize time.

## Environment variables

```sh
# Switch the provider on (default is off).
AUTH_ENTRA_ENABLED=true

# Application (client) ID from the app registration Overview page.
AZURE_AD_CLIENT_ID=11111111-2222-3333-4444-555555555555

# Tenant: GUID, domain, or common / organizations / consumers.
# Defaults to "common" when empty.
AZURE_AD_TENANT_ID=common

# Client secret Value from Certificates & secrets (shown only once).
AZURE_AD_CLIENT_SECRET=REPLACE_ME
```

Names verified against `getEntraCredentials` in
`lib/auth-providers.ts`: the provider is *configured* only when client
ID and secret are both non-empty; tenant falls back to `common`. Also
set `NEXT_PUBLIC_SITE_URL` to the origin you registered above.

Restart the server after changing these.

## Verify it works

1. Open the login page: a **Microsoft Entra ID** button should appear.
2. Confirm the flag via the providers API:

   ```sh
   curl -s http://localhost:3000/api/auth/providers | python3 -m json.tool
   ```

   Look for `{"id": "entra", "label": "Microsoft Entra ID",
   "enabled": true}`.
3. Click the button, sign in at Microsoft, approve the consent prompt.
   You should land back in BYOV signed in as that account's email.

## Troubleshooting

- **No button / `enabled: false`.** `AUTH_ENTRA_ENABLED` is not exactly
  `true`, or the server was not restarted.
- **`400 "… is not configured."`** on the authorize URL. Client ID or
  secret is empty (values are trimmed; whitespace-only counts as
  empty). Double-check you copied the secret **Value**, not the ID.
- **`AADSTS50011: redirect URI mismatch`.** The URI in the registration
  must equal `{origin}/api/auth/oauth/entra/callback` character for
  character. Re-check `NEXT_PUBLIC_SITE_URL`, scheme (`http` vs
  `https`), and trailing slashes.
- **`AADSTS7000215: invalid client secret`.** The secret is wrong,
  expired, or belongs to a different registration. Create a new one and
  update `AZURE_AD_CLIENT_SECRET`.
- **`AADSTS50194 / wrong-tenant errors`.** The tenant in the URL does
  not match the account: a personal account cannot sign into a
  single-tenant app. Align the registration's account types with
  `AZURE_AD_TENANT_ID` (`common` for mixed audiences).
- **`/login?error=oauth-failed`.** Token exchange or `id_token` claim
  checks (audience, issuer, expiry, nonce) failed. Typical causes:
  expired secret, changed tenant, or server clock skew.
- **`/login?error=not-allowed`.** Microsoft login succeeded but the
  email is outside `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS`.
