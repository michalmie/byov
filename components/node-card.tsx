"use client";

import type { Node } from "@/lib/control-plane";
import type { NodeUsageEntry } from "@/lib/settings";
import { HealthPill } from "./data-ui";

export type NodeRemoveState = "ready" | "pinned" | "confirming";

function kindBlurb(kind: string): string {
  if (kind === "Coolify") {
    return "Provision and deploy applications through a Coolify instance.";
  }
  if (kind === "Vercel") {
    return "Provision and deploy applications through Vercel cloud projects.";
  }
  return `Deploy applications through this ${kind} node.`;
}

/**
 * One managed node as a card: name, kind and default tags, status plus
 * Manage/Remove actions, a capability line, and Instance/Location/
 * Environments facts. Presentational — the page owns all state.
 */
export function NodeCard({
  node,
  isDefault,
  usage,
  removeState,
  onManage,
  onRemove,
  onConfirmRemove,
  onCancelRemove,
}: {
  node: Node;
  isDefault: boolean;
  usage: NodeUsageEntry[];
  removeState: NodeRemoveState;
  onManage: () => void;
  onRemove: () => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
}) {
  const pinned = usage.length > 0;
  const envTitle = pinned
    ? usage.map((entry) => `${entry.appName} / ${entry.env}`).join(", ")
    : "No environments pinned";

  return (
    <article
      aria-labelledby={`${node.slug}-name`}
      className="card grid gap-3 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id={`${node.slug}-name`}
              className="text-[15px] font-semibold tracking-tight"
            >
              {node.name}
            </h3>
            <span
              className="tag px-2 py-0.5 text-xs"
              style={{
                background: "var(--color-paper-2)",
                color: "var(--color-ink-2)",
              }}
            >
              {node.kind}
            </span>
            {isDefault && (
              <span
                className="tag px-2 py-0.5 text-xs"
                style={{
                  background: "var(--color-info-soft)",
                  color: "var(--color-ink)",
                }}
              >
                Default
              </span>
            )}
          </div>
          <p
            className="mono text-xs"
            style={{ color: "var(--color-ink-2)" }}
          >
            {node.slug}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthPill health={node.status} />
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            onClick={onManage}
          >
            Manage
          </button>
          {removeState === "pinned" ? (
            <button
              type="button"
              disabled
              title="Environments are still pinned to this node."
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Remove
            </button>
          ) : removeState === "confirming" ? (
            <>
              <button
                type="button"
                className="btn-danger px-3 py-1.5 text-sm"
                onClick={onConfirmRemove}
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={onCancelRemove}
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-sm"
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <p
        className="max-w-2xl text-sm"
        style={{ color: "var(--color-ink-2)" }}
      >
        {kindBlurb(node.kind)}
      </p>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[13px] font-medium">Instance</dt>
          <dd
            className="mono truncate text-sm"
            style={{ color: "var(--color-ink-2)" }}
            title={node.endpoint ?? "No endpoint configured"}
          >
            {node.endpoint ?? "No endpoint configured"}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] font-medium">Location</dt>
          <dd className="text-sm" style={{ color: "var(--color-ink-2)" }}>
            {node.location}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] font-medium">API token</dt>
          <dd className="text-sm" style={{ color: "var(--color-ink-2)" }}>
            {node.kind === "Coolify"
              ? node.hasApiToken
                ? "Saved"
                : "Missing — Manage to add"
              : "Managed by provider"}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] font-medium">Environments</dt>
          <dd
            className="text-sm"
            style={{ color: "var(--color-ink-2)" }}
            title={envTitle}
          >
            {pinned ? `${usage.length} pinned` : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
