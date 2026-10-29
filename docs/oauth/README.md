---
title: "OAuth sign-in overview"
description: "How OAuth sign-in works in BYOV, which providers are supported, and the setup steps they all share."
---

# OAuth sign-in overview

BYOV supports sign-in with four external identity providers, alongside
the built-in passwordless code and magic-link methods. Each provider is
off by default and is switched on independently with an
`AUTH_<PROVIDER>_ENABLED` flag plus its credentials.

## Supported providers

| Provider | Login button label | Scopes requested | Setup guide |
|----------|--------------------|------------------|-------------|
| Microsoft Entra ID | Microsoft Entra ID | `openid profile email` | [entra.md](./entra.md) |
| GitHub | GitHub | `read:user user:email` | [github.md](./github.md) |
| Google | Google | `openid profile email` | [google.md](./google.md) |
| Apple | Apple | `name email` | [apple.md](./apple.md) |

Scopes and labels are fixed in code (`lib/auth-providers.ts`); there is
nothing to configure about them.

## How the flow works

1. The login page fetches `GET /api/auth/providers` and renders one
   button per provider whose flag is on.
2. Clicking a button starts
   `GET /api/auth/oauth/<provider>/authorize`, which sets single-use
   `HttpOnly` state/PKCE cookies and redirects (302) to the provider
   with a PKCE S256 challenge.
3. The provider redirects back to
   `GET /api/auth/oauth/<provider>/callback`. The server exchanges the
   code for tokens, verifies the identity, checks the email allowlist,
   and sets the session cookie.
4. Failures redirect to `/login?error=oauth-failed` ("Sign-in failed,
   please try again."). An address outside the allowlist redirects to
   `/login?error=not-allowed` ("Your email is not on the access list.").

A provider only works when it is **both enabled and configured**: the
authorize endpoint answers `400 "… is not configured."` when
credentials are missing and `400 "… is disabled."` when the flag is off.

## The callback URL

Every provider must be registered with this exact redirect URI pattern:

```text
{NEXT_PUBLIC_SITE_URL}/api/auth/oauth/<provider>/callback
```

Concretely, for local development with the default site URL:

```text
http://localhost:3000/api/auth/oauth/<provider>/callback
```

The server builds this URL with `getOAuthRedirectUri`, which is
`resolveRequestOrigin(request)` plus the route path. Origin resolution
order:

1. `NEXT_PUBLIC_SITE_URL` when set (trailing slashes stripped) — this
   is what you register at the provider, so set it to your public URL
   in production.
2. Otherwise the `x-forwarded-host` / `x-forwarded-proto` headers.
3. Otherwise the request origin (`0.0.0.0` rewritten to `localhost`).

If the registered URI and the computed URI differ by even one
character, the provider refuses the login with a redirect-URI-mismatch
error.

## Setup steps shared by all providers

1. Register BYOV as an application at the provider (see the
   per-provider guide) with the callback URL above.
2. Set the provider's `AUTH_*_ENABLED=true` flag and its credentials in
   the environment (dev: `.env.local`; prod: environment).
3. Restart the server so the new variables take effect.
4. Verify (see below).

### Access control

OAuth identities still pass through the server allowlist:

- `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS`: who may sign in.
  When both are empty, any email may sign in (dev default).
- `AUTH_ADMIN_EMAILS`: workspace admins. On a fresh install with no
  bootstrap claim yet, the first user to sign in becomes admin.

Also required in production: `AUTH_SECRET` (session signing) and
`NEXT_PUBLIC_SITE_URL` (your public origin).

## Verify it works

1. Open the login page. You should see one button per enabled
   provider (for example "Continue with GitHub").
2. Check the providers API directly:

   ```sh
   curl -s http://localhost:3000/api/auth/providers | python3 -m json.tool
   ```

   Expect an entry like `{"id": "github", "label": "GitHub",
   "enabled": true}` for each provider you switched on.
3. Click the button and complete the provider login. You land back in
   BYOV with a session cookie.

## Troubleshooting

- **No provider button on the login page.** The flag is off or the
  providers fetch failed. Check `GET /api/auth/providers` output and
  confirm `AUTH_<PROVIDER>_ENABLED=true` (exactly the string `true`)
  plus a server restart.
- **`400 "… is not configured."`** from the authorize endpoint. One or
  more credential variables are empty. Compare them against the
  per-provider guide; values are trimmed, so all-whitespace counts as
  empty.
- **`400 "… is disabled."`** from the authorize endpoint. Credentials
  are present but the `AUTH_*_ENABLED` flag is not `true`.
- **Redirect-URI mismatch at the provider.** The URI registered at the
  provider must equal `{origin}/api/auth/oauth/<provider>/callback`
  exactly. Usual causes: `NEXT_PUBLIC_SITE_URL` still points at
  `localhost` in production, a trailing slash, or `http` vs `https`.
- **`/login?error=oauth-failed` after approving.** The code exchange or
  identity check failed. Common causes: wrong/expired client secret
  (or, for Apple, a malformed private key), a changed tenant, clock
  skew, or cookies blocked (the flow needs its short-lived state
  cookies). Check the server logs for the failing step.
- **`/login?error=not-allowed` after approving.** The OAuth login
  succeeded but the email is not on `AUTH_ALLOWED_EMAILS` /
  `AUTH_ALLOWED_DOMAINS`. Add it and try again.
