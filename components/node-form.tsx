"use client";

import { useState } from "react";
import {
  SUPPORTED_NODE_KINDS,
  type NodeDraft,
  type NodeField,
  type NodeFieldErrors,
} from "@/lib/settings";

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

export function NodeForm({
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
  initial: NodeDraft;
  submitLabel: string;
  onSubmit: (draft: NodeDraft) => NodeFieldErrors | null;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<NodeDraft>(initial);
  const [errors, setErrors] = useState<NodeFieldErrors>({});

  function set(field: NodeField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = onSubmit(draft);
    if (result) {
      setErrors(result);
    }
  }

  const describedBy = (field: NodeField, hintId: string) =>
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
            placeholder="frankfurt-02"
            value={draft.name}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name", `${formId}-name-hint`)}
            onChange={(event) => set("name", event.target.value)}
          />
          <p id={`${formId}-name-hint`} className="hint">
            Display name. The node slug derives from it and never changes.
          </p>
          <FieldError id={`${formId}-name-error`} message={errors.name} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-kind`}>
            Type
          </label>
          <select
            id={`${formId}-kind`}
            className="input max-w-md"
            value={draft.kind}
            aria-invalid={Boolean(errors.kind)}
            aria-describedby={describedBy("kind", `${formId}-kind-hint`)}
            onChange={(event) => set("kind", event.target.value)}
          >
            {SUPPORTED_NODE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind} (self-hosted)
              </option>
            ))}
            <option value="Kubernetes" disabled>
              Kubernetes (soon)
            </option>
          </select>
          <p id={`${formId}-kind-hint`} className="hint">
            Only self-hosted Coolify nodes deploy apps today.
          </p>
          <FieldError id={`${formId}-kind-error`} message={errors.kind} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-location`}>
            Location
          </label>
          <input
            id={`${formId}-location`}
            className="input max-w-md"
            type="text"
            autoComplete="off"
            placeholder="Frankfurt"
            value={draft.location}
            aria-invalid={Boolean(errors.location)}
            aria-describedby={describedBy("location", `${formId}-location-hint`)}
            onChange={(event) => set("location", event.target.value)}
          />
          <p id={`${formId}-location-hint`} className="hint">
            Where the hardware lives — a city, site, or lab.
          </p>
          <FieldError
            id={`${formId}-location-error`}
            message={errors.location}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-endpoint`}>
            Endpoint <span className="hint">(optional)</span>
          </label>
          <input
            id={`${formId}-endpoint`}
            className="input max-w-md"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://coolify.example.com"
            value={draft.endpoint}
            aria-invalid={Boolean(errors.endpoint)}
            aria-describedby={describedBy("endpoint", `${formId}-endpoint-hint`)}
            onChange={(event) => set("endpoint", event.target.value)}
          />
          <p id={`${formId}-endpoint-hint`} className="hint">
            Where the control plane reaches this node. Credentials are managed
            when the node adapter lands.
          </p>
          <FieldError
            id={`${formId}-endpoint-error`}
            message={errors.endpoint}
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
