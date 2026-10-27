"use client";

import { useState } from "react";
import {
  SUPPORTED_TEMPLATE_NODE_KINDS,
  TEMPLATE_STATUSES,
  type TemplateDraft,
  type TemplateField,
  type TemplateFieldErrors,
} from "@/lib/templates";

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

const statusHints: Record<string, string> = {
  draft: "Draft — visible in the workspace, still being shaped.",
  stable: "Stable — paved road, ready to scaffold from.",
  deprecated: "Deprecated — kept for reference, not for new apps.",
};

export function TemplateForm({
  formId,
  heading,
  lede,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  formId: string;
  heading: string;
  lede: string;
  initial: TemplateDraft;
  submitLabel: string;
  onSubmit: (draft: TemplateDraft) => TemplateFieldErrors | null;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [errors, setErrors] = useState<TemplateFieldErrors>({});

  function set(field: TemplateField, value: string | string[]) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  }

  function setLayer(index: number, field: "label" | "value", value: string) {
    setDraft((prev) => ({
      ...prev,
      stack: prev.stack.map((item, position) =>
        position === index ? { ...item, [field]: value } : item,
      ),
    }));
    setErrors((prev) =>
      prev.stack ? { ...prev, stack: undefined } : prev,
    );
  }

  function addLayer() {
    setDraft((prev) => ({
      ...prev,
      stack: [...prev.stack, { label: "", value: "" }],
    }));
    setErrors((prev) =>
      prev.stack ? { ...prev, stack: undefined } : prev,
    );
  }

  function removeLayer(index: number) {
    setDraft((prev) => ({
      ...prev,
      stack: prev.stack.filter((_, position) => position !== index),
    }));
    setErrors((prev) =>
      prev.stack ? { ...prev, stack: undefined } : prev,
    );
  }

  function toggleNode(kind: string) {
    const nodes = draft.nodes.includes(kind)
      ? draft.nodes.filter((entry) => entry !== kind)
      : [...draft.nodes, kind];
    set("nodes", nodes);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = onSubmit(draft);
    if (result) {
      setErrors(result);
    }
  }

  const describedBy = (field: TemplateField, hintId: string) =>
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
      <form onSubmit={handleSubmit} noValidate className="grid gap-5">
        <div className="field">
          <label className="field-label" htmlFor={`${formId}-name`}>
            Name
          </label>
          <input
            id={`${formId}-name`}
            className="input max-w-md"
            type="text"
            autoComplete="off"
            placeholder="Data Notebook"
            value={draft.name}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name", `${formId}-name-hint`)}
            onChange={(event) => set("name", event.target.value)}
          />
          <p id={`${formId}-name-hint`} className="hint">
            Display name. The template slug derives from it and never changes.
          </p>
          <FieldError id={`${formId}-name-error`} message={errors.name} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-tagline`}>
            Tagline
          </label>
          <input
            id={`${formId}-tagline`}
            className="input max-w-2xl"
            type="text"
            autoComplete="off"
            placeholder="What this stack is for, in one line."
            value={draft.tagline}
            aria-invalid={Boolean(errors.tagline)}
            aria-describedby={describedBy("tagline", `${formId}-tagline-hint`)}
            onChange={(event) => set("tagline", event.target.value)}
          />
          <p id={`${formId}-tagline-hint`} className="hint">
            Shown in the catalog next to the template name.
          </p>
          <FieldError id={`${formId}-tagline-error`} message={errors.tagline} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-status`}>
            Status
          </label>
          <select
            id={`${formId}-status`}
            className="input max-w-md"
            value={draft.status}
            aria-invalid={Boolean(errors.status)}
            aria-describedby={describedBy("status", `${formId}-status-hint`)}
            onChange={(event) => set("status", event.target.value)}
          >
            {TEMPLATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusHints[status]}
              </option>
            ))}
          </select>
          <p id={`${formId}-status-hint`} className="hint">
            New templates start as drafts until the stack is verified.
          </p>
          <FieldError id={`${formId}-status-error`} message={errors.status} />
        </div>

        <fieldset className="field">
          <legend className="field-label">Stack</legend>
          <div className="grid gap-3">
            {draft.stack.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
              >
                <input
                  className="input"
                  type="text"
                  autoComplete="off"
                  placeholder="Layer, e.g. Framework"
                  aria-label={`Stack layer ${index + 1} label`}
                  value={item.label}
                  onChange={(event) =>
                    setLayer(index, "label", event.target.value)
                  }
                />
                <input
                  className="input"
                  type="text"
                  autoComplete="off"
                  placeholder="Choice, e.g. Next.js 16 (App Router)"
                  aria-label={`Stack layer ${index + 1} value`}
                  value={item.value}
                  onChange={(event) =>
                    setLayer(index, "value", event.target.value)
                  }
                />
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-sm"
                  aria-label={`Remove stack layer ${index + 1}`}
                  onClick={() => removeLayer(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-sm"
              onClick={addLayer}
            >
              Add layer
            </button>
          </div>
          <p id={`${formId}-stack-hint`} className="hint">
            The tech stack embedded in this template — name a Framework layer
            to show it in the catalog.
          </p>
          <FieldError id={`${formId}-stack-error`} message={errors.stack} />
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">Gate commands</legend>
          <div className="grid gap-3 sm:max-w-md">
            <div className="grid gap-1">
              <label className="hint" htmlFor={`${formId}-testCommand`}>
                Unit tests
              </label>
              <input
                id={`${formId}-testCommand`}
                className="input mono text-sm"
                type="text"
                autoComplete="off"
                placeholder="npm run test:unit"
                value={draft.testCommand}
                aria-invalid={Boolean(errors.testCommand)}
                onChange={(event) => set("testCommand", event.target.value)}
              />
              <FieldError
                id={`${formId}-testCommand-error`}
                message={errors.testCommand}
              />
            </div>
            <div className="grid gap-1">
              <label className="hint" htmlFor={`${formId}-lintCommand`}>
                Lint
              </label>
              <input
                id={`${formId}-lintCommand`}
                className="input mono text-sm"
                type="text"
                autoComplete="off"
                placeholder="npm run lint"
                value={draft.lintCommand}
                aria-invalid={Boolean(errors.lintCommand)}
                onChange={(event) => set("lintCommand", event.target.value)}
              />
              <FieldError
                id={`${formId}-lintCommand-error`}
                message={errors.lintCommand}
              />
            </div>
            <div className="grid gap-1">
              <label className="hint" htmlFor={`${formId}-buildCommand`}>
                Production build
              </label>
              <input
                id={`${formId}-buildCommand`}
                className="input mono text-sm"
                type="text"
                autoComplete="off"
                placeholder="npm run build"
                value={draft.buildCommand}
                aria-invalid={Boolean(errors.buildCommand)}
                onChange={(event) => set("buildCommand", event.target.value)}
              />
              <FieldError
                id={`${formId}-buildCommand-error`}
                message={errors.buildCommand}
              />
            </div>
          </div>
          <p className="hint">
            The five gate names stay governed — only the commands adapt per
            stack. DLP scan and dependency audit run as BYOV gates.
          </p>
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">Node targets</legend>
          <div className="flex flex-wrap gap-4">
            {SUPPORTED_TEMPLATE_NODE_KINDS.map((kind) => (
              <label
                key={kind}
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--color-ink-2)" }}
              >
                <input
                  type="checkbox"
                  checked={draft.nodes.includes(kind)}
                  onChange={() => toggleNode(kind)}
                />
                <span className="mono">{kind}</span>
              </label>
            ))}
            <label
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--color-muted)" }}
            >
              <input type="checkbox" disabled />
              <span className="mono">kubernetes (soon)</span>
            </label>
          </div>
          <FieldError id={`${formId}-nodes-error`} message={errors.nodes} />
        </fieldset>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-starterRef`}>
            Starter ref <span className="hint">(optional)</span>
          </label>
          <input
            id={`${formId}-starterRef`}
            className="input max-w-2xl mono text-sm"
            type="text"
            autoComplete="off"
            placeholder="https://github.com/acme/data-notebook-starter"
            value={draft.starterRef}
            aria-invalid={Boolean(errors.starterRef)}
            aria-describedby={describedBy(
              "starterRef",
              `${formId}-starterRef-hint`,
            )}
            onChange={(event) => set("starterRef", event.target.value)}
          />
          <p id={`${formId}-starterRef-hint`} className="hint">
            Repo or blueprint the scaffold starts from. Blank keeps a
            workspace-local starter ref.
          </p>
          <FieldError
            id={`${formId}-starterRef-error`}
            message={errors.starterRef}
          />
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
