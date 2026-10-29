"use client";

import { useId, useState } from "react";
import { StatusPill } from "./data-ui";

interface DnsStage {
  ok: boolean;
  addresses?: string[];
  error?: string;
}

interface TlsStage {
  ok: boolean;
  authorized?: boolean;
  authorizationError?: string;
  cert?: { subject?: string };
  error?: string;
}

interface HttpStage {
  ok: boolean;
  status?: number;
  error?: string;
}

interface NodesTestResult {
  endpoint: string;
  host: string;
  port: number;
  reachable: boolean;
  stages: {
    dns: DnsStage;
    tls: TlsStage | null;
    http: HttpStage | null;
  };
  guidance?: string;
}

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: NodesTestResult; tested: string }
  | { status: "unavailable" }
  | { status: "failed"; message: string };

function isNodesTestResult(value: unknown): value is NodesTestResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<NodesTestResult>;
  return (
    typeof candidate.host === "string" &&
    typeof candidate.port === "number" &&
    typeof candidate.stages === "object" &&
    candidate.stages !== null &&
    typeof candidate.stages.dns === "object" &&
    candidate.stages.dns !== null
  );
}

function Stage({
  label,
  tone,
  detail,
}: {
  label: string;
  tone: "ok" | "bad" | "info" | "warn";
  detail: string;
}) {
  return (
    <span className="flex items-center gap-2 text-xs">
      <StatusPill tone={tone} label={label} />
      <span className="mono truncate">{detail}</span>
    </span>
  );
}

/**
 * Test a node endpoint via the server probe endpoint. Advisory only:
 * it never blocks saving — the node stays Pending until first contact.
 */
export function NodeTestButton({ endpoint }: { endpoint: string }) {
  const hintId = useId();
  const [state, setState] = useState<State>({ status: "idle" });
  const trimmed = endpoint.trim();

  async function run() {
    if (!trimmed) {
      return;
    }
    const tested = trimmed;
    setState({ status: "running" });
    try {
      const response = await fetch("/api/nodes-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: tested }),
      });
      if (response.status === 404) {
        setState({ status: "unavailable" });
        return;
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : `Request failed with HTTP ${response.status}.`;
        setState({ status: "failed", message });
        return;
      }
      if (!isNodesTestResult(body)) {
        setState({
          status: "failed",
          message: "Unexpected verification response — try again.",
        });
        return;
      }
      setState({ status: "done", result: body, tested });
    } catch {
      // The backend ships separately: a network failure means the probe
      // is not there yet, not that the endpoint is wrong.
      setState({ status: "unavailable" });
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-[13px]"
          onClick={run}
          disabled={!trimmed || state.status === "running"}
          aria-describedby={!trimmed ? hintId : undefined}
        >
          {state.status === "running" ? "Testing…" : "Test"}
        </button>
        {!trimmed && (
          <span id={hintId} className="hint">
            Enter the endpoint above first.
          </span>
        )}
      </div>
      <div aria-live="polite" className="grid gap-1">
        {state.status === "unavailable" && (
          <p className="hint">
            Verification is unavailable right now — you can still save; the
            node stays Pending until first contact.
          </p>
        )}
        {state.status === "failed" && (
          <p className="form-error text-xs">{state.message}</p>
        )}
        {state.status === "done" && (
          <>
            <Stage
              label="DNS"
              tone={state.result.stages.dns.ok ? "ok" : "bad"}
              detail={
                state.result.stages.dns.ok
                  ? (state.result.stages.dns.addresses ?? []).join(", ") ||
                    state.result.host
                  : (state.result.stages.dns.error ?? "failed")
              }
            />
            {state.result.stages.tls && (
              <Stage
                label="TLS"
                tone={state.result.stages.tls.ok ? "ok" : "bad"}
                detail={
                  state.result.stages.tls.ok
                    ? (state.result.stages.tls.cert?.subject ?? "valid")
                    : (state.result.stages.tls.error ??
                      state.result.stages.tls.authorizationError ??
                      "failed")
                }
              />
            )}
            {state.result.stages.http && (
              <Stage
                label="HTTP"
                tone={state.result.stages.http.ok ? "info" : "warn"}
                detail={
                  state.result.stages.http.ok
                    ? `status ${state.result.stages.http.status}`
                    : (state.result.stages.http.error ?? "failed")
                }
              />
            )}
            <p className="text-xs" style={{ color: "var(--color-ink-2)" }}>
              {state.result.reachable
                ? `Reachable at ${state.result.host}:${state.result.port}.`
                : `Not reachable at ${state.result.host}:${state.result.port} — you can still save; the node stays Pending.`}
            </p>
            {state.result.guidance && (
              <p className="hint">{state.result.guidance}</p>
            )}
            {state.tested !== trimmed && (
              <p className="hint">
                The endpoint changed since this test — test again.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
