"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { HealthPill, StatusPill } from "@/components/data-ui";
import { NodeForm } from "@/components/node-form";
import { SettingsSubnav } from "@/components/settings-subnav";
import { listApps } from "@/lib/control-plane";
import { useManagedNodes } from "@/lib/settings-store";
import { nodeUsage, type NodeDraft } from "@/lib/settings";

const blankDraft: NodeDraft = {
  name: "",
  kind: "Coolify",
  location: "",
  endpoint: "",
};

export default function SettingsNodes() {
  const { nodes, createNode, updateNode, deleteNode, resetNodes } =
    useManagedNodes();
  const apps = listApps();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const editingNode = editing
    ? nodes.find((node) => node.slug === editing)
    : undefined;

  function closePanels() {
    setAdding(false);
    setEditing(null);
  }

  return (
    <ControlPlaneShell crumb="Settings / Nodes" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Nodes
          </h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Add and manage deployment targets. New nodes start as Pending
            until the control plane contacts them; a node with pinned
            environments cannot be removed.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!adding && !editing && (
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-[13px]"
                onClick={() => {
                  setAdding(true);
                  setNotice(null);
                }}
              >
                Add node
              </button>
            )}
            {confirmReset ? (
              <>
                <button
                  type="button"
                  className="btn-danger px-3 py-1.5 text-[13px]"
                  onClick={() => {
                    resetNodes();
                    closePanels();
                    setConfirmReset(false);
                    setNotice("Nodes are back to sample data.");
                  }}
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-[13px]"
                  onClick={() => setConfirmReset(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-[13px]"
                onClick={() => setConfirmReset(true)}
              >
                Reset to sample data
              </button>
            )}
          </div>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        {adding && (
          <NodeForm
            key="new"
            formId="add-node"
            heading="Add node"
            lede="Register a deployment target. It stays Pending until first contact."
            initial={blankDraft}
            submitLabel="Add node"
            onSubmit={(draft) => {
              const errors = createNode(draft);
              if (errors) {
                return errors;
              }
              closePanels();
              setNotice(
                `Added ${draft.name.trim()} — pending first contact.`,
              );
              return null;
            }}
            onCancel={closePanels}
          />
        )}

        {editingNode && (
          <NodeForm
            key={editingNode.slug}
            formId="edit-node"
            heading={`Edit ${editingNode.name}`}
            lede={`Slug ${editingNode.slug} never changes, so pinned environments keep working.`}
            initial={{
              name: editingNode.name,
              kind: editingNode.kind,
              location: editingNode.location,
              endpoint: editingNode.endpoint ?? "",
            }}
            submitLabel="Save node"
            onSubmit={(draft) => {
              const errors = updateNode(editingNode.slug, draft);
              if (errors) {
                return errors;
              }
              closePanels();
              setNotice(`Saved ${draft.name.trim()}.`);
              return null;
            }}
            onCancel={closePanels}
          />
        )}

        <div className="overflow-x-auto">
          <table className="spec-table min-w-[820px]">
            <thead>
              <tr>
                <th scope="col">Node</th>
                <th scope="col">Type</th>
                <th scope="col">Location</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Status</th>
                <th scope="col">Envs</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const usage = nodeUsage(node.slug, apps);
                const pinned = usage.length > 0;
                const isConfirming = confirmingRemove === node.slug;
                return (
                  <tr key={node.slug}>
                    <td>
                      <span className="mono text-sm font-semibold">
                        {node.name}
                      </span>
                      <span
                        className="mono block text-sm"
                        style={{ color: "var(--color-ink-2)" }}
                      >
                        {node.slug}
                      </span>
                    </td>
                    <td>{node.kind}</td>
                    <td className="text-sm">{node.location}</td>
                    <td
                      className="mono max-w-[220px] truncate text-sm"
                      title={node.endpoint ?? "No endpoint configured"}
                    >
                      {node.endpoint ?? "—"}
                    </td>
                    <td>
                      <HealthPill health={node.status} />
                    </td>
                    <td
                      className="text-sm"
                      title={
                        pinned
                          ? usage
                              .map(
                                (entry) =>
                                  `${entry.appName} / ${entry.env}`,
                              )
                              .join(", ")
                          : "No environments pinned"
                      }
                    >
                      {pinned ? `${usage.length} pinned` : "—"}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1.5 text-sm"
                          onClick={() => {
                            setAdding(false);
                            setEditing(node.slug);
                            setConfirmingRemove(null);
                            setNotice(null);
                          }}
                        >
                          Edit
                        </button>
                        {pinned ? (
                          <button
                            type="button"
                            disabled
                            title="Environments are still pinned to this node."
                            className="btn-ghost px-3 py-1.5 text-sm"
                          >
                            Remove
                          </button>
                        ) : isConfirming ? (
                          <>
                            <button
                              type="button"
                              className="btn-danger px-3 py-1.5 text-sm"
                              onClick={() => {
                                const reason = deleteNode(node.slug);
                                setConfirmingRemove(null);
                                if (reason) {
                                  setNotice(reason);
                                } else {
                                  closePanels();
                                  setNotice(`Removed ${node.name}.`);
                                }
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="btn-ghost px-3 py-1.5 text-sm"
                              onClick={() => setConfirmingRemove(null)}
                            >
                              Keep
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1.5 text-sm"
                            onClick={() => {
                              setConfirmingRemove(node.slug);
                              setNotice(null);
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ControlPlaneShell>
  );
}
