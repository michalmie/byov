"use client";

import { useState } from "react";

/** Deploy one env via the machine API (session cookie auth). */
export function DeployButton({
  appSlug,
  envName,
}: {
  appSlug: string;
  envName: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function deploy() {
    setState("busy");
    setMessage("");
    try {
      const res = await fetch(
        `/api/v1/apps/${encodeURIComponent(appSlug)}/envs/${encodeURIComponent(envName)}/deploy`,
        { method: "POST", headers: { accept: "application/json" } },
      );
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || body.ok !== true) {
        throw new Error(body.error ?? `Deploy failed (HTTP ${res.status}).`);
      }
      setState("done");
      setMessage("Deploy started — refresh to see live status.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Deploy failed.");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-primary px-3 py-1.5 text-[13px]"
        disabled={state === "busy"}
        onClick={() => void deploy()}
      >
        {state === "busy" ? "Deploying…" : "Deploy"}
      </button>
      {message && (
        <span
          className="text-xs"
          style={{ color: state === "error" ? "var(--color-bad)" : "var(--color-muted)" }}
          role={state === "error" ? "alert" : undefined}
        >
          {message}
        </span>
      )}
    </span>
  );
}
