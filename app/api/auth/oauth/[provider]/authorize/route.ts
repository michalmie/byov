import { NextResponse } from "next/server";
import {
  getProviderCredentials,
  isKnownProvider,
  isProviderEnabled,
} from "@/lib/auth-providers";
import {
  buildAuthorizeUrl,
  getOAuthRedirectUri,
  isSafeNext,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  pkceCodeChallenge,
  randomCodeVerifier,
  randomState,
  shouldUseSecureCookies,
} from "@/lib/auth-oauth";

/**
 * Start an OAuth2/OIDC login: `GET /api/auth/oauth/<provider>/authorize`.
 * Sets single-use HttpOnly state/verifier cookies and redirects (302) to
 * the provider with a PKCE S256 challenge (plus an OIDC nonce, which reuses
 * the state value so the callback can verify it without extra storage).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  if (!isKnownProvider(provider)) {
    return NextResponse.json(
      { ok: false, error: "Unknown OAuth provider." },
      { status: 404 },
    );
  }
  const credentials = getProviderCredentials(provider);
  if (!credentials) {
    return NextResponse.json(
      { ok: false, error: `OAuth provider "${provider}" is not configured.` },
      { status: 400 },
    );
  }
  if (!isProviderEnabled(provider)) {
    return NextResponse.json(
      { ok: false, error: `OAuth provider "${provider}" is disabled.` },
      { status: 400 },
    );
  }

  const next = new URL(request.url).searchParams.get("next");
  const state = randomState();
  const verifier = randomCodeVerifier();
  const redirectUri = getOAuthRedirectUri(request, provider);
  const authorizeUrl = buildAuthorizeUrl(
    provider,
    credentials.credentials.clientId,
    {
      state,
      nonce: state,
      codeChallenge: await pkceCodeChallenge(verifier),
      redirectUri,
    },
  );

  const response = NextResponse.redirect(authorizeUrl, 302);
  const secure = shouldUseSecureCookies();
  const cookieBase = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieBase);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieBase);
  if (isSafeNext(next)) {
    // Stored raw: Next percent-encodes the Set-Cookie value on serialize
    // and the callback applies exactly one decodeURIComponent.
    response.cookies.set(OAUTH_NEXT_COOKIE, next, cookieBase);
  }
  return response;
}
