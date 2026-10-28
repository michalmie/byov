// OAuth sign-in links for the public login page.
//
// Plain <a> navigations to GET /api/auth/oauth/<id>/authorize?next=...
// (see the shared auth contract). No client-side fetch: the browser follows
// the link and the API drives the provider round-trip.

export interface OAuthProviderInfo {
  id: string;
  label: string;
  enabled: boolean;
}

export const OAUTH_PROVIDER_IDS = ["entra", "github", "google", "apple"] as const;

interface AuthOAuthButtonsProps {
  /** Providers from GET /api/auth/providers (or the local fallback list). */
  providers: OAuthProviderInfo[];
  /** Sanitized relative redirect target (single leading slash, else "/"). */
  next: string;
}

export function AuthOAuthButtons({ providers, next }: AuthOAuthButtonsProps) {
  const oauth = providers.filter(
    (provider) =>
      (OAUTH_PROVIDER_IDS as readonly string[]).includes(provider.id) &&
      provider.enabled,
  );
  if (oauth.length === 0) return null;

  const query = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="grid gap-2">
      {oauth.map((provider) => (
        <a
          key={provider.id}
          data-testid={`oauth-${provider.id}`}
          href={`/api/auth/oauth/${provider.id}/authorize${query}`}
          className="btn-ghost w-full items-center justify-center px-3 py-2 text-sm"
        >
          Continue with {provider.label}
        </a>
      ))}
    </div>
  );
}
