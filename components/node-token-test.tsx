"use client";

import { useState } from "react";
import { StatusPill } from "./data-ui";

/**
 * Authenticated Coolify check via /api/workspace/nodes/verify-token.
 * Tests the pasted token, or the saved one when the field is blank.
 */
export function NodeTokenTestButton({
  endpoint,
  apiToken,
  slug,
  onResult,
}: {
  endpoint: string;
  apiToken: string;
  slug?: string;
  /** Reports (passed, tested endpoint+token) for the create-gate. */
  onResult?: (result: { ok: boolean; endpoint: string; apiToken: string }) => void;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "done"; ok: boolean; detail: string }
  >({ status: "idle" });

  async function run() {
    setState({ status: "running" });
    try {
      const res = await fetch("/api/workspace/nodes/verify-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: endpoint.trim(),
          apiToken: apiToken.trim(),
          slug: slug ?? "",
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { ok: boolean; detail: string };
        error?: string;
      };
      if (!res.ok || body.ok !== true || !body.data) {
        throw new Error(body.error ?? `Request failed (HTTP ${res.status}).`);
      }
      setState({ status: "done", ok: body.data.ok, detail: body.data.detail });
      onResult?.({
        ok: body.data.ok,
        endpoint: endpoint.trim(),
        apiToken: apiToken.trim(),
      });
    } catch (error) {
      setState({
        status: "done",
        ok: false,
        detail: error instanceof Error ? error.message : "Test failed.",
      });
      onResult?.({ ok: false, endpoint: endpoint.trim(), apiToken: apiToken.trim() });
    }
  }

  const disabled = !endpoint.trim() || state.status === "running";
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-[13px]"
          onClick={() => void run()}
          disabled={disabled}
        >
          {state.status === "running" ? "Testing token…" : "Test token"}
        </button>
        {!endpoint.trim() && (
          <span className="hint">Enter the endpoint above first.</span>
        )}
      </div>
      <div aria-live="polite">
        {state.status === "done" && (
          <span className="flex items-center gap-2 text-xs">
            <StatusPill tone={state.ok ? "ok" : "bad"} label={state.ok ? "Token OK" : "Token failed"} />
            <span style={{ color: "var(--color-ink-2)" }}>{state.detail}</span>
          </span>
        )}
      </div>
    </div>
  );
}
