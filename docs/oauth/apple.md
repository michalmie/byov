---
title: "Sign in with Apple"
description: "Set up a Services ID and Sign in with Apple key, and configure APPLE_* credentials for OIDC sign-in."
---

# Sign in with Apple

## What it enables

Users sign in to BYOV with their Apple ID. The login page shows an
**Apple** button that runs an OIDC authorization-code flow with PKCE
against `https://appleid.apple.com/auth/authorize` (with
`response_mode=query` so the code returns to the `GET` callback).
Requested scopes: `name email`. There is no static client secret:
the server signs a short-lived ES256 `client_secret` JWT from your
Sign in with Apple private key on every token exchange. The verified
email — possibly an Apple private-relay address — becomes the BYOV
account email (still subject to the allowlist).

## Prerequisites

- An **Apple Developer Program** membership (paid): Sign in with
  Apple configuration requires it.
- Portal: [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
- A domain you control for the Services ID configuration (for local
  development Apple still requires a real, verifiable domain — see
  step 2).

## Register the application

1. **Create a Services ID** (Identifiers → **+** → **Services IDs** →
   Continue):
   - **Description**: anything recognizable, for example `BYOV`.
   - **Identifier**: reverse-DNS, for example `com.example.signin` →
     `APPLE_CLIENT_ID`.
   - Tick **Sign in with Apple**, then **Configure**:
     - **Primary App ID**: pick any App ID in your team (required by
       Apple even for web-only sign-in).
     - **Domains and Subdomains**: your BYOV host, for example
       `byov.example.com` (Apple verifies domain ownership; plain
       `localhost` is not accepted here — use a tunnel with a public
       hostname for local testing).
     - **Return URLs**: exactly

       ```text
       {NEXT_PUBLIC_SITE_URL}/api/auth/oauth/apple/callback
       ```

       Production example:

       ```text
       https://byov.example.com/api/auth/oauth/apple/callback
       ```

       The server computes this with `getOAuthRedirectUri`
       (`resolveRequestOrigin` + route path); `NEXT_PUBLIC_SITE_URL`
       wins, so register whatever it is set to in each environment.
2. **Create a Sign in with Apple key** (Keys → **+**):
   - Name it, tick **Sign in with Apple**, configure it against your
     Primary App ID, and register.
   - Copy the **Key ID** → `APPLE_KEY_ID`.
   - **Download** the `.p8` file immediately — it cannot be
     re-downloaded. Its contents become `APPLE_PRIVATE_KEY` (see
     below).
3. Copy your **Team ID** from the top-right account menu (or the
   Membership page) → `APPLE_TEAM_ID`.

## Environment variables

```sh
# Switch the provider on (default is off).
AUTH_APPLE_ENABLED=true

# Services ID identifier, e.g. com.example.signin.
APPLE_CLIENT_ID=com.example.signin

# 10-character Team ID from your Apple Developer membership.
APPLE_TEAM_ID=ABCDE12345

# Key ID of the Sign in with Apple key.
APPLE_KEY_ID=XYZAB67890

# Private key from the downloaded .p8 file, as ONE line with literal
# \n escapes (the server converts \n back to newlines before signing):
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...\n-----END PRIVATE KEY-----
```

Names verified against `getAppleCredentials` in
`lib/auth-providers.ts`: the provider is *configured* only when all
four values are non-empty. Also set `NEXT_PUBLIC_SITE_URL` to the
origin you registered above.

To produce the one-line key from the `.p8` file:

```sh
awk 'BEGIN{ORS="\\n"} {print}' AuthKey_XYZAB67890.p8
```

Restart the server after changing these.

## Verify it works

1. Open the login page: an **Apple** button should appear.
2. Confirm the flag via the providers API:

   ```sh
   curl -s http://localhost:3000/api/auth/providers | python3 -m json.tool
   ```

   Look for `{"id": "apple", "label": "Apple", "enabled": true}`.
3. Click the button, sign in with your Apple ID (choose Share or Hide
   My Email). You should land back in BYOV signed in. With Hide My
   Email, the account email is your `@privaterelay.appleid.com`
   address — add *that* address to `AUTH_ALLOWED_EMAILS` if you use an
   allowlist.

## Troubleshooting

- **No button / `enabled: false`.** `AUTH_APPLE_ENABLED` is not
  exactly `true`, or the server was not restarted.
- **`400 "… is not configured."`** on the authorize URL. One of the
  four `APPLE_*` values is empty (values are trimmed;
  whitespace-only counts as empty). The usual suspect is a missing or
  empty `APPLE_PRIVATE_KEY`.
- **`invalid_request: redirect_uri mismatch` at Apple.** The Return
  URL on the Services ID must equal
  `{origin}/api/auth/oauth/apple/callback` character for character,
  and its domain must be listed under Domains and Subdomains.
- **`invalid_client` on the token exchange** (surfaces as
  `/login?error=oauth-failed`). The signed `client_secret` was
  rejected. Causes: wrong Team ID or Key ID, the key was revoked, or
  the private key does not match the Key ID. Also confirm the PEM kept
  its header/footer lines and uses literal `\n` (real newlines inside
  the env value break parsing on some platforms).
- **`/login?error=oauth-failed` after approving.** Besides the above:
  the Services ID is misconfigured, or server clock skew pushed the
  5-minute `client_secret` JWT outside its validity window.
- **`/login?error=not-allowed`.** Apple login succeeded but the email
  (possibly the private-relay address) is outside
  `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS`.
- **Name/email missing on re-auth.** Apple sends the name only on the
  first authorization and may omit `email_verified` on re-auths (the
  server only enforces it when present). To re-test first-run
  behavior, revoke BYOV at [appleid.apple.com → Sign-In and
  Security](https://appleid.apple.com/account/manage) first.
