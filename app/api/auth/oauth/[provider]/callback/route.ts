import { NextResponse } from "next/server";
import {
  getProviderCredentials,
  isKnownProvider,
} from "@/lib/auth-providers";
import {
  createSessionValue,
  exchangeCodeForTokens,
  getOAuthCallbackBaseUrl,
  getOAuthRedirectUri,
  isEmailAllowed,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  resolveNext,
  resolveOAuthIdentity,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  timingSafeEqual,
  shouldUseSecureCookies,
} from "@/lib/auth-oauth";
import { resolveLoginRole } from "@/lib/auth-bootstrap";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function asParam(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}

function clearOAuthCookies(response: NextResponse, request: Request): void {
  const secure = shouldUseSecureCookies(request);
  for (const name of [
    OAUTH_STATE_COOKIE,
    OAUTH_VERIFIER_COOKIE,
    OAUTH_NEXT_COOKIE,
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: 0,
    });
  }
}

/**
 * Finish an OAuth2/OIDC login: `GET|POST
 * /api/auth/oauth/<provider>/callback`. POST carries the same fields as
 * form data (Apple `form_post`); every failure redirects to
 * `/login?error=oauth-failed` without leaking details, and an address
 * outside the allowlist redirects to `/login?error=not-allowed`.
 */
async function handleCallback(request: Request, providerParam: string) {
  if (!isKnownProvider(providerParam)) {
    return NextResponse.json(
      { ok: false, error: "Unknown OAuth provider." },
      { status: 404 },
    );
  }
  const provider = providerParam;
  const baseUrl = getOAuthCallbackBaseUrl(request);
  const fail = () => {
    const response = NextResponse.redirect(
      new URL("/login?error=oauth-failed", baseUrl),
      302,
    );
    clearOAuthCookies(response, request);
    return response;
  };

  const query = new URL(request.url).searchParams;
  let code = asParam(query.get("code"));
  let state = asParam(query.get("state"));
  let providerError = asParam(query.get("error"));

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      try {
        const form = await request.formData();
        const field = (name: string): string | null => {
          const value = form.get(name);
          return typeof value === "string" ? asParam(value) : null;
        };
        code ??= field("code");
        state ??= field("state");
        providerError ??= field("error");
      } catch {
        return fail();
      }
    }
  }

  const cookieState = readCookie(request, OAUTH_STATE_COOKIE);
  const verifier = readCookie(request, OAUTH_VERIFIER_COOKIE);
  let nextCookie = readCookie(request, OAUTH_NEXT_COOKIE);
  if (nextCookie) {
    try {
      nextCookie = decodeURIComponent(nextCookie);
    } catch {
      nextCookie = null;
    }
  }

  if (providerError) return fail();
  if (!code || !state || !cookieState || !verifier) return fail();
  if (!timingSafeEqual(state, cookieState)) return fail();

  const credentials = getProviderCredentials(provider);
  if (!credentials) return fail();

  const tokens = await exchangeCodeForTokens({
    code,
    redirectUri: getOAuthRedirectUri(request, provider),
    codeVerifier: verifier,
    credentials,
  });
  if (!tokens) return fail();

  const identity = await resolveOAuthIdentity(provider, tokens, {
    clientId: credentials.credentials.clientId,
    ...(provider === "entra" && credentials.provider === "entra"
      ? { tenantId: credentials.credentials.tenantId }
      : {}),
    // The authorize step reused `state` as the OIDC nonce.
    nonce: cookieState,
  });
  if (!identity) return fail();

  if (!isEmailAllowed(identity.email)) {
    const response = NextResponse.redirect(
      new URL("/login?error=not-allowed", baseUrl),
      302,
    );
    clearOAuthCookies(response, request);
    return response;
  }

  const sessionValue = await createSessionValue({
    sub: identity.sub,
    email: identity.email,
    ...(identity.name ? { name: identity.name } : {}),
    provider,
    role: await resolveLoginRole(identity.email),
  });
  const response = NextResponse.redirect(
    new URL(resolveNext(nextCookie), baseUrl),
    302,
  );
  clearOAuthCookies(response, request);
  response.cookies.set(SESSION_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: shouldUseSecureCookies(request),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  return handleCallback(request, provider);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  return handleCallback(request, provider);
}
