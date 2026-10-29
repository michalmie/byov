---
title: "Sign in with Google"
description: "Create a Google OAuth client ID and configure GOOGLE_CLIENT_* credentials for OIDC sign-in."
---

# Sign in with Google

## What it enables

Users sign in to BYOV with their Google account. The login page shows a
**Google** button that runs an OIDC authorization-code flow with PKCE
against `https://accounts.google.com/o/oauth2/v2/auth`. Requested
scopes: `openid profile email`. The server requires a **verified**
email (`email_verified`) from the `id_token`; it becomes the BYOV
account email (still subject to the allowlist).

## Prerequisites

- A Google account with access to a Cloud project (any project,
  including a fresh one, works).
- Portal: [Google Cloud console → APIs & Services →
  Credentials](https://console.cloud.google.com/apis/credentials).
- If the project has no OAuth consent screen yet, you must configure
  one first (see step 1).

## Register the application

1. If needed, configure the **OAuth consent screen** (APIs & Services
   → OAuth consent screen): choose External or Internal, fill in the
   app name and support email. While the app is in **Testing** mode,
   add each sign-in address under **Test users**, or publish the app.
2. Open **Credentials** → **Create Credentials** → **OAuth client ID**.
3. **Application type**: **Web application**.
4. Under **Authorized redirect URIs**, add exactly:

   ```text
   {NEXT_PUBLIC_SITE_URL}/api/auth/oauth/google/callback
   ```

   Local development example:

   ```text
   http://localhost:3000/api/auth/oauth/google/callback
   ```

   The server computes this with `getOAuthRedirectUri`
   (`resolveRequestOrigin` + route path); `NEXT_PUBLIC_SITE_URL`
   wins, so register whatever it is set to in each environment.
5. Click **Create** and copy the **Client ID** (ends in
   `.apps.googleusercontent.com`) → `GOOGLE_CLIENT_ID` and the
   **Client secret** → `GOOGLE_CLIENT_SECRET`.

## Environment variables

```sh
# Switch the provider on (default is off).
AUTH_GOOGLE_ENABLED=true

# OAuth client ID, e.g. 1234567890-abc123.apps.googleusercontent.com.
GOOGLE_CLIENT_ID=REPLACE_WITH_CLIENT_ID

# OAuth client secret from the Credentials page.
GOOGLE_CLIENT_SECRET=REPLACE_ME
```

Names verified against `getGoogleCredentials` in
`lib/auth-providers.ts`: the provider is *configured* only when both
values are non-empty. Also set `NEXT_PUBLIC_SITE_URL` to the origin
you registered above.

Restart the server after changing these.

## Verify it works

1. Open the login page: a **Google** button should appear.
2. Confirm the flag via the providers API:

   ```sh
   curl -s http://localhost:3000/api/auth/providers | python3 -m json.tool
   ```

   Look for `{"id": "google", "label": "Google", "enabled": true}`.
3. Click the button, pick an account at Google, approve consent. You
   should land back in BYOV signed in as that account's email.

## Troubleshooting

- **No button / `enabled: false`.** `AUTH_GOOGLE_ENABLED` is not
  exactly `true`, or the server was not restarted.
- **`400 "… is not configured."`** on the authorize URL. Client ID or
  secret is empty (values are trimmed; whitespace-only counts as
  empty).
- **`Error 400: redirect_uri_mismatch`.** The URI in the client
  configuration must equal `{origin}/api/auth/oauth/google/callback`
  character for character. Re-check `NEXT_PUBLIC_SITE_URL`, scheme,
  and trailing slashes.
- **`Error 403: access_denied` / "not a test user".** The consent
  screen is in Testing mode and the account is not listed under Test
  users. Add it or publish the app.
- **`/login?error=oauth-failed` after approving.** Typical causes:
  wrong client secret, or an unverified Google email (the server
  requires `email_verified`), or server clock skew breaking `id_token`
  expiry checks.
- **`/login?error=not-allowed`.** Google login succeeded but the email
  is outside `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS`.
