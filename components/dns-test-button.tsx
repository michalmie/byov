"use client";

import { useState } from "react";
import { StatusPill } from "./data-ui";
import type { ProbeResult } from "@/lib/dns-probe";

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ProbeResult }
  | { status: "failed"; message: string };

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

/** Live DNS + TLS test for one hostname, via the server probe endpoint. */
export function DnsTestButton({
  host,
  port = 443,
  note,
}: {
  host: string;
  port?: number;
  note?: string;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    setState({ status: "running" });
    try {
      const response = await fetch("/api/dns-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host, port }),
      });
      const body = (await response.json()) as ProbeResult | { error: string };
      if (!response.ok || "error" in body) {
        setState({
          status: "failed",
          message:
            "error" in body && typeof body.error === "string"
              ? body.error
              : `Request failed with HTTP ${response.status}.`,
        });
        return;
      }
      setState({ status: "done", result: body });
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost px-2 py-1 text-xs"
        onClick={run}
        disabled={state.status === "running"}
      >
        {state.status === "running" ? "Testing…" : "Test"}
      </button>
      {state.status === "failed" && (
        <span className="form-error block text-xs">{state.message}</span>
      )}
      {state.status === "done" && (
        <span className="mt-1 grid gap-1">
          <Stage
            label="DNS"
            tone={state.result.dns.ok ? "ok" : "bad"}
            detail={
              state.result.dns.ok
                ? (state.result.dns.addresses ?? []).join(", ")
                : (state.result.dns.error ?? "failed")
            }
          />
          {state.result.tls && (
            <Stage
              label="TLS"
              tone={state.result.tls.ok ? "ok" : "bad"}
              detail={
                state.result.tls.ok
                  ? (state.result.tls.cert?.subject ?? "valid")
                  : (state.result.tls.error ?? "failed")
              }
            />
          )}
          {state.result.http && (
            <Stage
              label="HTTP"
              tone={state.result.http.ok ? "info" : "warn"}
              detail={
                state.result.http.ok
                  ? `status ${state.result.http.status}`
                  : (state.result.http.error ?? "failed")
              }
            />
          )}
          {note && <span className="hint block">{note}</span>}
        </span>
      )}
    </>
  );
}
