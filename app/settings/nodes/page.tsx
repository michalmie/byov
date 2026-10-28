"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { DnsTestButton } from "@/components/dns-test-button";
import { NodeCard } from "@/components/node-card";
import { NodeForm } from "@/components/node-form";
import { NodeSetupGuide } from "@/components/node-setup-guide";
import { SettingsSubnav } from "@/components/settings-subnav";
import { listApps } from "@/lib/control-plane";
import { useManagedNodes, useWorkspaceSettings } from "@/lib/settings-store";
import { nodeUsage, type NodeDraft } from "@/lib/settings";

const blankDraft: NodeDraft = {
  name: "",
  kind: "Coolify",
  location: "",
  endpoint: "",
  domainZone: "",
  tailnetHost: "",
};

export default function SettingsNodes() {
  const { nodes, createNode, updateNode, deleteNode, resetNodes } =
    useManagedNodes();
  const { settings } = useWorkspaceSettings();
  const apps = listApps();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [nextStepsFor, setNextStepsFor] = useState<string | null>(null);

  const editingNode = editing
    ? nodes.find((node) => node.slug === editing)
    : undefined;
  const zoned = nodes.filter((node) => node.domainZone);
  const unzoned = nodes.filter((node) => !node.domainZone);
  const tailnetNodes = nodes.filter((node) => node.tailnetHost);
  const hasSetup = zoned.length > 0 || tailnetNodes.length > 0;

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
                    setNextStepsFor(null);
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
          <div className="grid gap-6">
            <NodeSetupGuide />
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
                setNextStepsFor(draft.name.trim());
                return null;
              }}
              onCancel={closePanels}
            />
          </div>
        )}

        {nextStepsFor && !adding && !editing && (
          <section
            aria-labelledby="node-next-steps-heading"
            className="card grid gap-3 p-5 sm:p-6"
          >
            <h2
              id="node-next-steps-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Next steps for {nextStepsFor}
            </h2>
            <ul className="grid max-w-2xl list-disc gap-2 pl-5 text-sm">
              <li>
                The node stays Pending until the control plane first
                contacts it — no passing test is needed to save.
              </li>
              <li>
                Set its zone (Manage the node) and add the wildcard DNS
                record in DNS setup below.
              </li>
              <li>
                Use the Tests in DNS setup to verify DNS, TLS, and HTTP
                from the BYOV server.
              </li>
            </ul>
          </section>
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
              domainZone: editingNode.domainZone ?? "",
              tailnetHost: editingNode.tailnetHost ?? "",
            }}
            submitLabel="Save node"
            onSubmit={(draft) => {
              const errors = updateNode(editingNode.slug, draft);
              if (errors) {
                return errors;
              }
              closePanels();
              setNotice(`Saved ${draft.name.trim()}.`);
              setNextStepsFor(null);
              return null;
            }}
            onCancel={closePanels}
          />
        )}

        <section
          aria-labelledby="configured-nodes-heading"
          className="grid gap-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="configured-nodes-heading"
                className="text-[15px] font-semibold tracking-tight"
              >
                Configured nodes
              </h2>
              <p
                className="mt-0.5 text-[13px]"
                style={{ color: "var(--color-muted)" }}
              >
                {nodes.length === 0
                  ? "No nodes available"
                  : `${nodes.length} node${nodes.length === 1 ? "" : "s"} available`}
              </p>
            </div>
            {!adding && !editing && (
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-[13px]"
                onClick={() => {
                  setAdding(true);
                  setNotice(null);
                  setNextStepsFor(null);
                }}
              >
                New node
              </button>
            )}
          </div>
          <ul className="grid gap-4">
            {nodes.map((node) => {
              const usage = nodeUsage(node.slug, apps);
              const pinned = usage.length > 0;
              const isConfirming = confirmingRemove === node.slug;
              return (
                <li key={node.slug}>
                  <NodeCard
                    node={node}
                    isDefault={settings.defaultNode === node.slug}
                    usage={usage}
                    removeState={
                      pinned ? "pinned" : isConfirming ? "confirming" : "ready"
                    }
                    onManage={() => {
                      setAdding(false);
                      setEditing(node.slug);
                      setConfirmingRemove(null);
                      setNotice(null);
                      setNextStepsFor(null);
                    }}
                    onRemove={() => {
                      setConfirmingRemove(node.slug);
                      setNotice(null);
                      setNextStepsFor(null);
                    }}
                    onConfirmRemove={() => {
                      const reason = deleteNode(node.slug);
                      setConfirmingRemove(null);
                      if (reason) {
                        setNotice(reason);
                      } else {
                        closePanels();
                        setNotice(`Removed ${node.name}.`);
                      }
                      setNextStepsFor(null);
                    }}
                    onCancelRemove={() => setConfirmingRemove(null)}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <section
          aria-labelledby="dns-heading"
          className="card grid gap-4 p-5 sm:p-6"
        >
          <div className="max-w-2xl">
            <h2
              id="dns-heading"
              className="text-xl font-semibold tracking-tight"
            >
              DNS setup
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              One wildcard record per zoned node; one certificate per
              tailnet node. Local zones live on your internal resolver.
              Tests run from the BYOV server.
            </p>
          </div>
          {hasSetup ? (
            <ul className="grid gap-2">
              {zoned.map((node) => (
                <li key={node.slug} className="mono text-sm">
                  <span
                    className="tag px-2 py-1 text-xs"
                    style={{
                      background: "var(--color-paper-2)",
                      color: "var(--color-ink-2)",
                    }}
                  >
                    A
                  </span>{" "}
                  *.{node.domainZone}{" "}
                  <span style={{ color: "var(--color-ink-2)" }}>
                    → {node.name}
                  </span>{" "}
                  <DnsTestButton
                    host={`byov-probe.${node.domainZone}`}
                    note="Probes carry no app — any HTTP status counts once DNS and TLS pass."
                  />
                </li>
              ))}
              {tailnetNodes.map((node) => (
                <li key={node.slug} className="mono text-sm">
                  {node.tailnetHost && settings.tailnetDomain ? (
                    <>
                      <span
                        className="tag px-2 py-1 text-xs"
                        style={{
                          background: "var(--color-paper-2)",
                          color: "var(--color-ink-2)",
                        }}
                      >
                        TLS
                      </span>{" "}
                      tailscale cert {node.tailnetHost}.
                      {settings.tailnetDomain}{" "}
                      <span style={{ color: "var(--color-ink-2)" }}>
                        → on {node.name}
                      </span>{" "}
                      <DnsTestButton
                        host={`${node.tailnetHost}.${settings.tailnetDomain}`}
                        note="Probes :443; tailnet apps serve on their own ports."
                      />
                    </>
                  ) : (
                    <span style={{ color: "var(--color-ink-2)" }}>
                      {node.name}: set the machine name and tailnet domain to
                      get env URLs.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">
              No node serves URLs yet — add a zone or tailnet setup above.
            </p>
          )}
          {unzoned.length > 0 && hasSetup && (
            <p className="hint">
              Without a zone: {unzoned.map((node) => node.name).join(", ")}.
            </p>
          )}
        </section>
      </div>
    </ControlPlaneShell>
  );
}
