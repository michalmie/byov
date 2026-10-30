"use client";

import { useState } from "react";
import {
  SUPPORTED_NODE_KINDS,
  type NodeDraft,
  type NodeField,
  type NodeFieldErrors,
} from "@/lib/settings";
import { NodeKindInstructions } from "./node-setup-guide";
import { NodeTestButton } from "./node-test-button";
import { NodeTokenTestButton } from "./node-token-test";

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

const KIND_QUALIFIERS: Record<string, string> = {
  Coolify: "self-hosted",
  Vercel: "cloud",
};

const KIND_HINTS: Record<string, string> = {
  Coolify: "Self-hosted: apps deploy to a Coolify instance you operate.",
  Vercel: "Cloud: apps deploy through Vercel cloud projects on your team.",
};

export function NodeForm({
  formId,
  heading,
  lede,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  savedToken = false,
  nodeSlug,
  requireConnectionTest = false,
}: {
  formId: string;
  heading: string;
  lede: string;
  initial: NodeDraft;
  submitLabel: string;
  onSubmit: (draft: NodeDraft) => NodeFieldErrors | null;
  onCancel: () => void;
  /** True when a token is already saved server-side (edit flows). */
  savedToken?: boolean;
  /** Node slug so Test token can fall back to the saved token. */
  nodeSlug?: string;
  /** Create flows: block submit until the connection test passes. */
  requireConnectionTest?: boolean;
}) {
  const [draft, setDraft] = useState<NodeDraft>(initial);
  const [errors, setErrors] = useState<NodeFieldErrors>({});
  const [endpointTest, setEndpointTest] = useState<{
    endpoint: string;
    ok: boolean;
  } | null>(null);
  const [tokenTest, setTokenTest] = useState<{
    endpoint: string;
    apiToken: string;
    ok: boolean;
  } | null>(null);
  const [gateError, setGateError] = useState("");
  const isVercel = draft.kind === "Vercel";

  const endpointValue = draft.endpoint.trim();
  const tokenValue = (draft.apiToken ?? "").trim();
  const connectionVerified =
    !requireConnectionTest ||
    (isVercel
      ? endpointTest?.ok === true && endpointTest.endpoint === endpointValue
      : tokenTest?.ok === true &&
        tokenTest.endpoint === endpointValue &&
        tokenTest.apiToken === tokenValue &&
        tokenValue.length > 0);

  function set(field: NodeField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (requireConnectionTest && !connectionVerified) {
      setGateError(
        isVercel
          ? "Test the connection first — a new node needs a passing endpoint test for the URL above."
          : "Test the connection first — a new node needs a passing Test token for the endpoint and API token above.",
      );
      return;
    }
    setGateError("");
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
      <form onSubmit={handleSubmit} noValidate className="grid gap-6">
        <fieldset className="grid gap-5">
          <legend className="text-sm font-semibold">
            Node type
          </legend>
          <p className="hint mt-1">
            What kind of deployment target this is — the setup checklist
            below follows your choice.
          </p>
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
                {kind} ({KIND_QUALIFIERS[kind] ?? "self-hosted"})
              </option>
            ))}
            <option value="Kubernetes" disabled>
              Kubernetes (soon)
            </option>
          </select>
          <p id={`${formId}-kind-hint`} className="hint">
            {KIND_HINTS[draft.kind] ??
              "Self-hosted: apps deploy to infrastructure you operate."}
          </p>
          <FieldError id={`${formId}-kind-error`} message={errors.kind} />
        </div>

        <NodeKindInstructions kind={draft.kind} />
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="text-sm font-semibold">
            {isVercel ? "About the project" : "About the server"}
          </legend>
          <p className="hint mt-1">
            How this node appears in lists and dashboards.
          </p>
        <div className="field">
          <label className="field-label" htmlFor={`${formId}-name`}>
            Name
          </label>
          <input
            id={`${formId}-name`}
            className="input max-w-md"
            type="text"
            autoComplete="off"
            placeholder={isVercel ? "acme-web" : "frankfurt-02"}
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
          <label className="field-label" htmlFor={`${formId}-location`}>
            Location
          </label>
          <input
            id={`${formId}-location`}
            className="input max-w-md"
            type="text"
            autoComplete="off"
            placeholder={isVercel ? "acme-team" : "Frankfurt"}
            value={draft.location}
            aria-invalid={Boolean(errors.location)}
            aria-describedby={describedBy("location", `${formId}-location-hint`)}
            onChange={(event) => set("location", event.target.value)}
          />
          <p id={`${formId}-location-hint`} className="hint">
            {isVercel
              ? "Which team or region owns it — a team name or region."
              : "Where the hardware lives — a city, site, or lab."}
          </p>
          <FieldError
            id={`${formId}-location-error`}
            message={errors.location}
          />
        </div>
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="text-sm font-semibold">
            Connect
          </legend>
          <p className="hint mt-1">
            {requireConnectionTest
              ? isVercel
                ? "Where BYOV finds your Vercel project — paste its dashboard URL. A passing connection test is required to create the node."
                : "Where BYOV reaches Coolify. A passing Test token is required to create the node."
              : isVercel
                ? "Where BYOV finds your Vercel project — paste its dashboard URL."
                : "Where BYOV reaches Coolify."}
          </p>
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
            placeholder={
              isVercel
                ? "https://vercel.com/team/project"
                : "https://coolify.example.com"
            }
            value={draft.endpoint}
            aria-invalid={Boolean(errors.endpoint)}
            aria-describedby={describedBy("endpoint", `${formId}-endpoint-hint`)}
            onChange={(event) => set("endpoint", event.target.value)}
          />
          <p id={`${formId}-endpoint-hint`} className="hint">
            {isVercel
              ? "Link to the Vercel project or team dashboard."
              : "Where the control plane reaches this node, e.g. https://panel.example.com."}
          </p>
          <FieldError
            id={`${formId}-endpoint-error`}
            message={errors.endpoint}
          />
          <NodeTestButton
            endpoint={draft.endpoint}
            onResult={(result) => setEndpointTest(result)}
          />
        </div>

        {!isVercel && (
          <div className="field">
            <label className="field-label" htmlFor={`${formId}-apiToken`}>
              Coolify API token{" "}
              <span className="hint">
                {savedToken ? "(saved — paste to replace)" : "(required to deploy)"}
              </span>
            </label>
            <input
              id={`${formId}-apiToken`}
              className="input max-w-md mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={savedToken ? "Token saved — leave blank to keep it" : "Paste the Coolify API token"}
              value={draft.apiToken ?? ""}
              aria-invalid={Boolean(errors.apiToken)}
              aria-describedby={describedBy("apiToken", `${formId}-apiToken-hint`)}
              onChange={(event) => set("apiToken", event.target.value)}
            />
            <p id={`${formId}-apiToken-hint`} className="hint">
              In Coolify, create an API token with permission to manage
              applications (in the Coolify panel under Keys &amp; Tokens /
              API tokens), then paste it here. BYOV uses it to create apps,
              set their FQDN, and deploy. It is encrypted on the BYOV server,
              never shown again, and blank keeps the saved token.
            </p>
            <FieldError
              id={`${formId}-apiToken-error`}
              message={errors.apiToken}
            />
            <NodeTokenTestButton
              endpoint={draft.endpoint}
              apiToken={draft.apiToken ?? ""}
              slug={nodeSlug}
              onResult={(result) => setTokenTest(result)}
            />
            {savedToken && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(draft.clearApiToken)}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      clearApiToken: event.target.checked,
                    }))
                  }
                />
                Remove the saved token on save
              </label>
            )}
          </div>
        )}
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="text-sm font-semibold">
            Serve URLs
          </legend>
          <p className="hint mt-1">
            Materials for environment URLs. Both are optional — set them
            now or edit the node later.
          </p>
        <div className="field">
          <label className="field-label" htmlFor={`${formId}-domainZone`}>
            Domain zone <span className="hint">(optional)</span>
          </label>
          <input
            id={`${formId}-domainZone`}
            className="input max-w-md"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="qa-lab-01.byov.xexo.io"
            value={draft.domainZone}
            aria-invalid={Boolean(errors.domainZone)}
            aria-describedby={describedBy(
              "domainZone",
              `${formId}-domainZone-hint`,
            )}
            onChange={(event) => set("domainZone", event.target.value)}
          />
          <p id={`${formId}-domainZone-hint`} className="hint">
            Zone this node serves public and local env URLs under, without
            the *. prefix. Create a *.zone record (public) or resolver entry
            (local) pointing at the node.
          </p>
          <FieldError
            id={`${formId}-domainZone-error`}
            message={errors.domainZone}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-tailnetHost`}>
            Tailnet machine name <span className="hint">(optional)</span>
          </label>
          <input
            id={`${formId}-tailnetHost`}
            className="input max-w-md"
            type="text"
            autoComplete="off"
            placeholder="qa-lab-01"
            value={draft.tailnetHost}
            aria-invalid={Boolean(errors.tailnetHost)}
            aria-describedby={describedBy(
              "tailnetHost",
              `${formId}-tailnetHost-hint`,
            )}
            onChange={(event) => set("tailnetHost", event.target.value)}
          />
          <p id={`${formId}-tailnetHost-hint`} className="hint">
            Machine name as known on the tailnet. Envs share it with stable
            ports; set the tailnet domain in DNS settings.
          </p>
          <FieldError
            id={`${formId}-tailnetHost-error`}
            message={errors.tailnetHost}
          />
        </div>
        </fieldset>

        <div className="grid gap-2">
          {gateError && (
            <p className="form-error" role="alert">{gateError}</p>
          )}
          {requireConnectionTest && !connectionVerified && (
            <p className="hint">
              {isVercel
                ? "Run Test above and get Reachable to enable creation."
                : "Run Test token above and get Token OK to enable creation."}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="btn-primary px-3 py-1.5 text-[13px]"
            disabled={requireConnectionTest && !connectionVerified}
          >
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
        </div>
      </form>
    </section>
  );
}
