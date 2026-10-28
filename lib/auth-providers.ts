/**
 * OAuth provider registry for the BYOV control plane.
 *
 * The four external identity providers behind
 * `/api/auth/oauth/<provider>/authorize` + `/callback`, with per-provider
 * env readers. Env names and tenant/label defaults follow the shared auth
 * contract (`auth-contract.md` in the task tree); no new dependencies —
 * Web Crypto + fetch only.
 */

export type OAuthProviderId = "entra" | "github" | "google" | "apple";

export interface OAuthProviderMeta {
  id: OAuthProviderId;
  /** Display label shown on the login page (contract: fixed strings). */
  label: string;
  /** OAuth scopes requested at authorize time. */
  scope: string;
  /** Name of the AUTH_<ID>_ENABLED env flag (default false unless "true"). */
  enabledEnvVar: string;
}

export const PROVIDERS: readonly OAuthProviderMeta[] = [
  {
    id: "entra",
    label: "Microsoft Entra ID",
    scope: "openid profile email",
    enabledEnvVar: "AUTH_ENTRA_ENABLED",
  },
  {
    id: "github",
    label: "GitHub",
    scope: "read:user user:email",
    enabledEnvVar: "AUTH_GITHUB_ENABLED",
  },
  {
    id: "google",
    label: "Google",
    scope: "openid profile email",
    enabledEnvVar: "AUTH_GOOGLE_ENABLED",
  },
  {
    id: "apple",
    label: "Apple",
    scope: "name email",
    enabledEnvVar: "AUTH_APPLE_ENABLED",
  },
] as const;

export function isKnownProvider(id: string): id is OAuthProviderId {
  return PROVIDERS.some((p) => p.id === id);
}

export function getProvider(id: string): OAuthProviderMeta | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Provider explicitly switched on via its AUTH_*_ENABLED flag. */
export function isProviderEnabled(id: OAuthProviderId): boolean {
  const meta = getProvider(id);
  if (!meta) return false;
  return readEnv(meta.enabledEnvVar) === "true";
}

export interface EntraCredentials {
  clientId: string;
  /** Azure tenant id, domain, or "common" (multi-tenant default). */
  tenantId: string;
  clientSecret: string;
}

export interface GitHubCredentials {
  clientId: string;
  clientSecret: string;
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export interface AppleCredentials {
  /** Services ID (client_id), e.g. com.example.signin. */
  clientId: string;
  teamId: string;
  keyId: string;
  /** PKCS#8 PEM; env stores it with literal `\n` escapes. */
  privateKeyPem: string;
}

export type ProviderCredentials =
  | { provider: "entra"; credentials: EntraCredentials }
  | { provider: "github"; credentials: GitHubCredentials }
  | { provider: "google"; credentials: GoogleCredentials }
  | { provider: "apple"; credentials: AppleCredentials };

export function getEntraCredentials(): EntraCredentials | null {
  const clientId = readEnv("AZURE_AD_CLIENT_ID");
  const clientSecret = readEnv("AZURE_AD_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    tenantId: readEnv("AZURE_AD_TENANT_ID") || "common",
    clientSecret,
  };
}

export function getGitHubCredentials(): GitHubCredentials | null {
  const clientId = readEnv("GITHUB_CLIENT_ID");
  const clientSecret = readEnv("GITHUB_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getGoogleCredentials(): GoogleCredentials | null {
  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getAppleCredentials(): AppleCredentials | null {
  const clientId = readEnv("APPLE_CLIENT_ID");
  const teamId = readEnv("APPLE_TEAM_ID");
  const keyId = readEnv("APPLE_KEY_ID");
  const privateKeyPem = readEnv("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!clientId || !teamId || !keyId || !privateKeyPem) return null;
  return { clientId, teamId, keyId, privateKeyPem };
}

export function getProviderCredentials(
  id: OAuthProviderId,
): ProviderCredentials | null {
  switch (id) {
    case "entra": {
      const credentials = getEntraCredentials();
      return credentials ? { provider: "entra", credentials } : null;
    }
    case "github": {
      const credentials = getGitHubCredentials();
      return credentials ? { provider: "github", credentials } : null;
    }
    case "google": {
      const credentials = getGoogleCredentials();
      return credentials ? { provider: "google", credentials } : null;
    }
    case "apple": {
      const credentials = getAppleCredentials();
      return credentials ? { provider: "apple", credentials } : null;
    }
  }
}

/** All credentials for the provider are present (independent of the flag). */
export function isProviderConfigured(id: OAuthProviderId): boolean {
  return getProviderCredentials(id) !== null;
}

export interface ProviderEndpoints {
  authorizationUrl: string;
  tokenUrl: string;
}

/**
 * OAuth2/OIDC endpoints per provider. Entra is tenant-scoped; the rest are
 * fixed hosts.
 */
export function getProviderEndpoints(id: OAuthProviderId): ProviderEndpoints {
  switch (id) {
    case "entra": {
      const tenant =
        readEnv("AZURE_AD_TENANT_ID") || "common";
      const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0`;
      return {
        authorizationUrl: `${base}/authorize`,
        tokenUrl: `${base}/token`,
      };
    }
    case "github":
      return {
        authorizationUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
      };
    case "google":
      return {
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
      };
    case "apple":
      return {
        authorizationUrl: "https://appleid.apple.com/auth/authorize",
        tokenUrl: "https://appleid.apple.com/auth/token",
      };
  }
}
