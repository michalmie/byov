"use client";

import { useState } from "react";
import Link from "next/link";
import type { Node } from "@/lib/control-plane";
import type { AppDraft, AppField, AppFieldErrors } from "@/lib/apps";
import type { TechStack } from "@/lib/stacks";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="form-error">
      {message}
    </p>
  );
}

export function AppForm({
  formId,
  heading,
  lede,
  initial,
  stacks,
  nodes,
  preferredNode,
  preferredStack,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  formId: string;
  heading: string;
  lede: string;
  initial: AppDraft;
  stacks: TechStack[];
  nodes: Node[];
  /** Workspace default node slug, or "" for none. */
  preferredNode: string;
  /** Prefilled stack slug (e.g. from ?stack=), or "" for none. */
  preferredStack?: string;
  submitLabel: string;
  onSubmit: (draft: AppDraft) => AppFieldErrors | null;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AppDraft>(initial);
  const [errors, setErrors] = useState<AppFieldErrors>({});

  // Empty selects fall back to the preferred option when it names a known
  // entry (the ?stack= prefill, the workspace default node for the
  // Sandbox), else the first option; explicit choices always win.
  const stack =
    draft.stack ||
    (preferredStack && stacks.some((entry) => entry.slug === preferredStack)
      ? preferredStack
      : (stacks[0]?.slug ?? ""));
  const node =
    draft.node ||
    (preferredNode && nodes.some((entry) => entry.slug === preferredNode)
      ? preferredNode
      : (nodes[0]?.slug ?? ""));

  function set(field: AppField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = onSubmit({ ...draft, stack, node });
    if (result) {
      setErrors(result);
    }
  }

  const describedBy = (field: AppField, hintId: string) =>
    errors[field] ? `${hintId} ${formId}-${field}-error` : hintId;

  return (
    <section
      aria-labelledby={`${formId}-heading`}
      className="card grid gap-6 p-5 sm:p-6"
    >
      <div className="max-w-2xl">
        <h2
          id={`${formId}-heading`}
          className="text-xl font-semibold tracking-tight"
        >
          {heading}
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-ink-2)" }}
        >
          {lede}
        </p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="grid gap-6">
        <div className="field">
          <label className="field-label" htmlFor={`${formId}-name`}>
            Name
          </label>
          <input
            id={`${formId}-name`}
            className="input max-w-md"
            type="text"
            autoComplete="off"
            placeholder="Rota Planner"
            value={draft.name}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name", `${formId}-name-hint`)}
            onChange={(event) => set("name", event.target.value)}
          />
          <p id={`${formId}-name-hint`} className="hint">
            Display name. The app slug derives from it and never changes.
          </p>
          <FieldError id={`${formId}-name-error`} message={errors.name} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-description`}>
            Description
          </label>
          <input
            id={`${formId}-description`}
            className="input max-w-md"
            type="text"
            autoComplete="off"
            placeholder="Shift planning without the spreadsheet."
            value={draft.description}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy(
              "description",
              `${formId}-description-hint`,
            )}
            onChange={(event) => set("description", event.target.value)}
          />
          <p id={`${formId}-description-hint`} className="hint">
            One line for the apps list and dashboard.
          </p>
          <FieldError
            id={`${formId}-description-error`}
            message={errors.description}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-stack`}>
            Tech stack
          </label>
          <select
            id={`${formId}-stack`}
            className="input max-w-md"
            value={stack}
            aria-invalid={Boolean(errors.stack)}
            aria-describedby={describedBy("stack", `${formId}-stack-hint`)}
            onChange={(event) => set("stack", event.target.value)}
          >
            {stacks.map((stack) => (
              <option key={stack.slug} value={stack.slug}>
                {stack.name}
              </option>
            ))}
          </select>
          <p id={`${formId}-stack-hint`} className="hint">
            Paved-road starter with the required gates built in.{" "}
            {stack && (
              <Link
                href={`/stacks/${stack}`}
                className="underline underline-offset-2"
              >
                Open the stack
              </Link>
            )}
          </p>
          <FieldError id={`${formId}-stack-error`} message={errors.stack} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-node`}>
            Sandbox node
          </label>
          <select
            id={`${formId}-node`}
            className="input max-w-md"
            value={node}
            aria-invalid={Boolean(errors.node)}
            aria-describedby={describedBy("node", `${formId}-node-hint`)}
            onChange={(event) => set("node", event.target.value)}
          >
            {nodes.map((node) => (
              <option key={node.slug} value={node.slug}>
                {node.name} — {node.location}
              </option>
            ))}
          </select>
          <p id={`${formId}-node-hint`} className="hint">
            The new app starts with one Sandbox environment on this node. It
            stays Pending until your first deploy.
          </p>
          <FieldError id={`${formId}-node-error`} message={errors.node} />
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary px-3 py-1.5 text-[13px]">
            {submitLabel}
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-[13px]"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
