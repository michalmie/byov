"use client";

import { useState } from "react";
import Link from "next/link";
import type { Node } from "@/lib/control-plane";
import { slugifyAppName, type AppDraft, type AppField, type AppFieldErrors } from "@/lib/apps";
import {
  canCreateRepos,
  resolveOwnerRepoGrant,
  resolveRepoFullName,
  resolveRepoUrl,
  type SourceControlSettings,
} from "@/lib/source-control";
import type { TechStack } from "@/lib/stacks";

/** Minimal workspace-member shape the owner picker needs. */
export interface AppOwnerOption {
  email: string;
  name?: string;
}

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
  sourceControl,
  owners,
  currentUserEmail,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  formId: string;
  /** Card heading; omit when the page title already says it. */
  heading?: string;
  lede?: string;
  initial: AppDraft;
  stacks: TechStack[];
  nodes: Node[];
  /** Workspace default node slug, or "" for none. */
  preferredNode: string;
  /** Prefilled stack slug (e.g. from ?stack=), or "" for none. */
  preferredStack?: string;
  /** Workspace GitHub taxonomy; preview + auto-link when it can create. */
  sourceControl?: SourceControlSettings;
  /** Workspace members the owner picker offers; empty shows an email input. */
  owners?: readonly AppOwnerOption[];
  /** Signed-in creator email, used as the owner until the picker is touched. */
  currentUserEmail?: string;
  submitLabel: string;
  onSubmit: (draft: AppDraft) => AppFieldErrors | null;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AppDraft>(initial);
  const [errors, setErrors] = useState<AppFieldErrors>({});
  // The stack is optional, so the ?stack= prefill only applies until the
  // user touches the select — otherwise "No stack yet" could never win.
  const [stackTouched, setStackTouched] = useState(false);
  // Same for the owner: the creator is the default owner until the
  // picker is touched, so "Unassigned" stays reachable.
  const [ownerTouched, setOwnerTouched] = useState(false);

  const preferredStackValid =
    preferredStack && stacks.some((entry) => entry.slug === preferredStack)
      ? preferredStack
      : "";
  // Empty selects fall back to the preferred option when it names a known
  // entry (the ?stack= prefill, the workspace default node for the
  // Sandbox), else the first option; explicit choices always win.
  const stack =
    draft.stack || (!stackTouched && preferredStackValid) || "";
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

  const effectiveSlug =
    draft.slug.trim() || slugifyAppName(draft.name) || "your-app";
  const willCreateRepo =
    Boolean(sourceControl) &&
    canCreateRepos(sourceControl!) &&
    sourceControl!.autoCreateRepo;
  const repoFullName = willCreateRepo
    ? resolveRepoFullName(sourceControl!, effectiveSlug)
    : "";
  const repoUrl = willCreateRepo
    ? resolveRepoUrl(sourceControl!, effectiveSlug)
    : "";
  const owner =
    (draft.owner ?? "") ||
    (!ownerTouched ? (currentUserEmail ?? "") : "");
  const ownerGithub = draft.ownerGithub ?? "";
  const ownerGrant = sourceControl
    ? resolveOwnerRepoGrant(sourceControl, effectiveSlug, ownerGithub)
    : null;
  const ownerOptions = owners ?? [];
  const ownerKnown = ownerOptions.some(
    (entry) => entry.email.toLowerCase() === owner.trim().toLowerCase(),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = onSubmit({
      ...draft,
      stack,
      node,
      owner,
      ownerGithub,
      ...(willCreateRepo
        ? { repoUrl, branch: sourceControl!.defaultBranch }
        : {}),
    });
    if (result) {
      setErrors(result);
    }
  }

  const describedBy = (field: AppField, hintId: string) =>
    errors[field] ? `${hintId} ${formId}-${field}-error` : hintId;

  return (
    <section
      aria-labelledby={heading ? `${formId}-heading` : undefined}
      aria-label={heading ? undefined : "New app form"}
      className="card grid gap-6 p-5 sm:p-6"
    >
      {heading && (
        <div className="max-w-2xl">
          <h2
            id={`${formId}-heading`}
            className="text-xl font-semibold tracking-tight"
          >
            {heading}
          </h2>
          {lede && (
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              {lede}
            </p>
          )}
        </div>
      )}
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
            Display name shown in lists and shortcuts.
          </p>
          <FieldError id={`${formId}-name-error`} message={errors.name} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-slug`}>
            Slug
          </label>
          <input
            id={`${formId}-slug`}
            className="input max-w-md mono"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={
              draft.slug.trim() || slugifyAppName(draft.name) || "rota-planner"
            }
            value={draft.slug}
            aria-invalid={Boolean(errors.slug)}
            aria-describedby={describedBy("slug", `${formId}-slug-hint`)}
            onChange={(event) => set("slug", event.target.value)}
          />
          <p id={`${formId}-slug-hint`} className="hint">
            Lowercase letters, numbers and hyphens. Leave blank to use the
            name-based default; the slug never changes.
          </p>
          <FieldError id={`${formId}-slug-error`} message={errors.slug} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-description`}>
            Description
          </label>
          <textarea
            id={`${formId}-description`}
            className="input max-w-md"
            rows={4}
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
            Optional — a few lines for the app page. Keep the first line
            short for lists.
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
            onChange={(event) => {
              setStackTouched(true);
              set("stack", event.target.value);
            }}
          >
            <option value="">No stack yet</option>
            {stacks.map((stack) => (
              <option key={stack.slug} value={stack.slug}>
                {stack.name}
              </option>
            ))}
          </select>
          <p id={`${formId}-stack-hint`} className="hint">
            Optional paved-road starter with the required gates built in.{" "}
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

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-owner`}>
            App owner
          </label>
          {ownerOptions.length > 0 ? (
            <select
              id={`${formId}-owner`}
              className="input max-w-md"
              value={owner}
              aria-invalid={Boolean(errors.owner)}
              aria-describedby={describedBy("owner", `${formId}-owner-hint`)}
              onChange={(event) => {
                setOwnerTouched(true);
                set("owner", event.target.value);
              }}
            >
              <option value="">Unassigned</option>
              {owner && !ownerKnown && (
                <option value={owner}>{owner}</option>
              )}
              {ownerOptions.map((entry) => (
                <option key={entry.email} value={entry.email}>
                  {entry.name ? `${entry.name} — ${entry.email}` : entry.email}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${formId}-owner`}
              className="input max-w-md"
              type="email"
              autoComplete="off"
              placeholder="owner@company.com"
              value={owner}
              aria-invalid={Boolean(errors.owner)}
              aria-describedby={describedBy("owner", `${formId}-owner-hint`)}
              onChange={(event) => {
                setOwnerTouched(true);
                set("owner", event.target.value);
              }}
            />
          )}
          <p id={`${formId}-owner-hint`} className="hint">
            Who owns this app. Defaults to you; pick a workspace member or
            leave Unassigned to decide later.
          </p>
          <FieldError id={`${formId}-owner-error`} message={errors.owner} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${formId}-owner-github`}>
            Owner GitHub username
          </label>
          <input
            id={`${formId}-owner-github`}
            className="input max-w-md mono"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="ada-dev"
            value={ownerGithub}
            aria-invalid={Boolean(errors.ownerGithub)}
            aria-describedby={describedBy(
              "ownerGithub",
              `${formId}-owner-github-hint`,
            )}
            onChange={(event) => set("ownerGithub", event.target.value)}
          />
          <p id={`${formId}-owner-github-hint`} className="hint">
            The owner is added as a contributor (push access) to the app
            repo when it is created or linked. Leave blank to invite them
            later.
          </p>
          <FieldError
            id={`${formId}-owner-github-error`}
            message={errors.ownerGithub}
          />
        </div>

        {sourceControl && (
          <div
            className="grid gap-1 p-4 text-sm"
            style={{
              background: "var(--color-paper)",
              border: "1px solid var(--color-rule)",
              borderRadius: "var(--radius-card)",
            }}
          >
            <p className="font-medium">Code repositories</p>
            {willCreateRepo ? (
              <>
                <p style={{ color: "var(--color-ink-2)" }}>
                  A GitHub repo will be created and linked:{" "}
                  <span className="mono font-medium">{repoFullName}</span> (
                  {sourceControl.defaultVisibility},{" "}
                  {sourceControl.defaultBranch}).
                </p>
                <p className="mono text-[13px]" style={{ color: "var(--color-muted)" }}>
                  {repoUrl}
                </p>
                {ownerGrant ? (
                  <p style={{ color: "var(--color-ink-2)" }}>
                    {ownerGrant.status === "already-owner" ? (
                      <>
                        Owner{" "}
                        <span className="mono">@{ownerGrant.username}</span>{" "}
                        owns{" "}
                        <span className="mono">
                          {sourceControl.accountLogin}
                        </span>{" "}
                        — they already have full access to{" "}
                        <span className="mono">{repoFullName}</span>.
                      </>
                    ) : (
                      <>
                        Owner{" "}
                        <span className="mono">@{ownerGrant.username}</span>{" "}
                        will be added as a contributor (push) to{" "}
                        <span className="mono">{repoFullName}</span>.
                      </>
                    )}
                  </p>
                ) : (
                  <p style={{ color: "var(--color-ink-2)" }}>
                    Add the owner&apos;s GitHub username above so they get
                    contributor access automatically.
                  </p>
                )}
              </>
            ) : sourceControl.connected ? (
              <p style={{ color: "var(--color-ink-2)" }}>
                GitHub is linked to{" "}
                <span className="mono">{sourceControl.accountLogin || "—"}</span>.
                Auto-create is off — link the repo from the app page.{" "}
                <Link href="/settings/source-control" className="underline underline-offset-2">
                  Code repository settings
                </Link>
              </p>
            ) : (
              <p style={{ color: "var(--color-ink-2)" }}>
                No GitHub account linked yet.{" "}
                <Link href="/settings/source-control" className="underline underline-offset-2">
                  Link GitHub in Settings → Code repositories
                </Link>{" "}
                to auto-create a private{" "}
                <span className="mono">byov-</span> repo for new apps.
              </p>
            )}
          </div>
        )}

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
