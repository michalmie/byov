---
title: "Sign in with GitHub"
description: "Create a GitHub OAuth App and configure GITHUB_CLIENT_* credentials for OAuth sign-in."
---

# Sign in with GitHub

## What it enables

Users sign in to BYOV with their GitHub account. The login page shows a
**GitHub** button that runs an OAuth2 authorization-code flow with PKCE
against `https://github.com/login/oauth/authorize`. Requested scopes:
`read:user user:email`. Unlike the other providers GitHub is plain
OAuth2 (no OIDC `id_token`): the server reads the identity from the
`user` and `user/emails` APIs and requires a **primary verified**
email, which becomes the BYOV account email (still subject to the
allowlist).

## Prerequisites

- A GitHub account able to register OAuth Apps (personal settings work
  for a single workspace; use an organization for shared setups).
- Portal: [GitHub Developer settings → OAuth
  Apps](https://github.com/settings/developers).

> Register an **OAuth App**, not a GitHub App. This codebase talks to
> the OAuth-App endpoints (`/login/oauth/authorize`,
> `/login/oauth/access_token`).

## Register the application

1. Open **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name**: anything recognizable, for example `BYOV`.
   - **Homepage URL**: your BYOV origin, for example
     `http://localhost:3000` locally.
   - **Authorization callback URL**: exactly

     ```text
     {NEXT_PUBLIC_SITE_URL}/api/auth/oauth/github/callback
     ```

     Local development example:

     ```text
     http://localhost:3000/api/auth/oauth/github/callback
     ```

     The server computes this with `getOAuthRedirectUri`
     (`resolveRequestOrigin` + route path); `NEXT_PUBLIC_SITE_URL`
     wins, so register whatever it is set to in each environment.
3. Click **Register application** and copy the **Client ID** →
   `GITHUB_CLIENT_ID`.
4. Click **Generate a new client secret** and copy it immediately →
   `GITHUB_CLIENT_SECRET`. It is shown only once.

## Environment variables

```sh
# Switch the provider on (default is off).
AUTH_GITHUB_ENABLED=true

# Client ID from the OAuth App page, e.g. Ov23liAbCdEfGhIjKlMn.
GITHUB_CLIENT_ID=REPLACE_WITH_CLIENT_ID

# Client secret generated on the OAuth App page (shown only once).
GITHUB_CLIENT_SECRET=REPLACE_ME
```

Names verified against `getGitHubCredentials` in
`lib/auth-providers.ts`: the provider is *configured* only when both
values are non-empty. Also set `NEXT_PUBLIC_SITE_URL` to the origin
you registered above.

Restart the server after changing these.

## Verify it works

1. Open the login page: a **GitHub** button should appear.
2. Confirm the flag via the providers API:

   ```sh
   curl -s http://localhost:3000/api/auth/providers | python3 -m json.tool
   ```

   Look for `{"id": "github", "label": "GitHub", "enabled": true}`.
3. Click the button, authorize at GitHub. You should land back in BYOV
   signed in as your primary verified GitHub email.

## Troubleshooting

- **No button / `enabled: false`.** `AUTH_GITHUB_ENABLED` is not
  exactly `true`, or the server was not restarted.
- **`400 "… is not configured."`** on the authorize URL. Client ID or
  secret is empty (values are trimmed; whitespace-only counts as
  empty).
- **`redirect_uri_mismatch` at GitHub.** The callback URL on the OAuth
  App page must equal `{origin}/api/auth/oauth/github/callback`
  character for character. Re-check `NEXT_PUBLIC_SITE_URL`, scheme,
  and trailing slashes.
- **`Incorrect client credentials`.** The secret is wrong, was
  regenerated, or belongs to a different app. Generate a new secret and
  update `GITHUB_CLIENT_SECRET`.
- **`/login?error=oauth-failed` after authorizing.** Typical causes:
  wrong secret, or the GitHub account has **no primary verified
  email** (check Settings → Emails: an address must be both primary
  and verified), or the `read:user user:email` scopes were declined.
- **`/login?error=not-allowed`.** GitHub login succeeded but the email
  is outside `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS`.
