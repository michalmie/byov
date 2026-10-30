"use client";

import { useCallback, useEffect, useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { SettingsSubnav } from "@/components/settings-subnav";
import { SectionHead } from "@/components/data-ui";
import type { TokenScope } from "@/lib/api-tokens";

// Mirrors TOKEN_SCOPES in lib/api-tokens (server module; keep client-safe).
const TOKEN_SCOPES: TokenScope[] = ["apps:read", "apps:write", "tokens:manage"];

interface TokenInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  scopes: string[];
}

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await res.json()) as { ok?: boolean; data?: T; error?: string };
  if (!res.ok || payload.ok !== true) {
    throw new Error(payload.error ?? `Request failed (HTTP ${res.status}).`);
  }
  return payload.data as T;
}

export default function SettingsTokens() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<TokenScope[]>(["apps:read", "apps:write"]);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTokens(await api<TokenInfo[]>("/api/v1/tokens"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tokens.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<TokenInfo[]>("/api/v1/tokens");
        if (!cancelled) setTokens(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load tokens.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<TokenInfo & { token: string }>("/api/v1/tokens", "POST", { name, scopes });
      setSecret(created.token);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the token.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError("");
    try {
      await api(`/api/v1/tokens/${encodeURIComponent(id)}`, "DELETE");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke the token.");
    }
  }

  function toggle(scope: TokenScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  return (
    <ControlPlaneShell crumb="Settings" subnav={<SettingsSubnav />}>
      <div className="grid max-w-3xl gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">API tokens</h1>
          <p className="mt-2 max-w-[65ch] text-sm" style={{ color: "var(--color-muted)" }}>
            Tokens connect the CLI and coding agents (MCP) to this workspace.
            Scope them narrowly — a deploy-only connector never needs token
            management. Secrets show once; store them in your agent config,
            never in a repo.
          </p>
        </div>

        <section className="card grid gap-4 p-5">
          <SectionHead title="Tokens" lede="Newest actions apply immediately; revocation keeps the audit record." />
          {tokens.length === 0 ? (
            <p className="hint">No tokens yet — create the first one below.</p>
          ) : (
            <ul className="grid gap-2">
              {tokens.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-semibold">{t.name}</span>
                  <span className="mono text-xs" style={{ color: "var(--color-muted)" }}>
                    {(t.scopes.length ? t.scopes : ["full access (legacy)"]).join(", ")}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {t.revokedAt ? `revoked ${t.revokedAt}` : t.lastUsedAt ? `last used ${t.lastUsedAt}` : "never used"}
                  </span>
                  {!t.revokedAt && (
                    <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => void revoke(t.id)}>
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={(e) => void create(e)} className="card grid gap-4 p-5">
          <SectionHead title="New token" lede="For a coding-agent connector, apps read + write is enough." />
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input max-w-md" value={name} onChange={(e) => setName(e.target.value)} placeholder="ada-laptop" required />
          </label>
          <fieldset className="grid gap-2">
            <legend className="field-label">Scopes</legend>
            {TOKEN_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggle(scope)} />
                <span className="mono">{scope}</span>
              </label>
            ))}
          </fieldset>
          <div>
            <button type="submit" className="btn-primary px-3 py-1.5 text-[13px]" disabled={busy}>
              {busy ? "Creating…" : "Create token"}
            </button>
          </div>
          {secret && (
            <p className="mono break-all text-[13px]" role="status">
              Save this token now (shown once): {secret}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">{error}</p>
          )}
        </form>
      </div>
    </ControlPlaneShell>
  );
}
