"use client";

import {
  APP_SLUG_TOKEN,
  DEFAULT_REPO_PATTERN,
  GITHUB_ACCOUNT_TYPES,
  GITHUB_ACCOUNT_TYPE_META,
  REPO_PROVIDER_META,
  REPO_PROVIDERS,
  REPO_VISIBILITIES,
  canCreateRepos,
  resolveRepoFullName,
  resolveRepoName,
  type GitHubAccountType,
  type RepoProvider,
  type RepoVisibility,
  type SourceControlFieldErrors,
  type SourceControlSettings,
} from "@/lib/source-control";

interface SourceControlFormProps {
  draft: SourceControlSettings;
  errors: SourceControlFieldErrors;
  onToggle: (
    field:
      | "connected"
      | "allowPublicRepos"
      | "autoCreateRepo",
    value: boolean,
  ) => void;
  onProvider: (value: RepoProvider) => void;
  onAccountType: (value: GitHubAccountType) => void;
  onVisibility: (value: RepoVisibility) => void;
  onText: (
    field:
      | "accountLogin"
      | "installationId"
      | "repoPattern"
      | "defaultBranch"
      | "topics",
    value: string,
  ) => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="form-error">
      {message}
    </p>
  );
}

const PREVIEW_SLUG = "rota-planner";
const FUTURE_PROVIDERS = ["GitLab", "Bitbucket", "Gitea"] as const;

export function SourceControlForm({
  draft,
  errors,
  onToggle,
  onProvider,
  onAccountType,
  onVisibility,
  onText,
}: SourceControlFormProps) {
  const repoName = resolveRepoName(draft, PREVIEW_SLUG);
  const fullName = resolveRepoFullName(draft, PREVIEW_SLUG);
  const ready = canCreateRepos(draft);

  return (
    <>
      <section
        aria-labelledby="sc-connection-heading"
        className="card grid gap-6 p-5 sm:p-6"
      >
        <div className="max-w-2xl">
          <h2
            id="sc-connection-heading"
            className="text-xl font-semibold tracking-tight"
          >
            GitHub connection
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Link a GitHub App installation once for the whole workspace.
            Install the BYOV GitHub App on a personal account or an
            Organization, then record the owner here — BYOV creates repos
            through that installation, never with a personal token pasted
            into the browser.
          </p>
        </div>

        <div className="field">
          <span className="field-label" id="sc-provider-label">
            Provider
          </span>
          <div
            role="radiogroup"
            aria-labelledby="sc-provider-label"
            className="grid gap-2"
          >
            {REPO_PROVIDERS.map((provider) => (
              <label key={provider} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="sc-provider"
                  value={provider}
                  checked={draft.provider === provider}
                  onChange={() => onProvider(provider)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">
                    {REPO_PROVIDER_META[provider].label}{" "}
                    <span className="hint">(default)</span>
                  </span>
                  <span className="hint">{REPO_PROVIDER_META[provider].blurb}</span>
                </span>
              </label>
            ))}
            {FUTURE_PROVIDERS.map((label) => (
              <label key={label} className="flex items-start gap-2 text-sm" aria-disabled="true">
                <input type="radio" name="sc-provider" disabled className="mt-1" />
                <span>
                  <span className="block font-medium">
                    {label} <span className="hint">(soon)</span>
                  </span>
                  <span className="hint">Coming later — GitHub connects today.</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError id="sc-provider-error" message={errors.provider} />
        </div>

        <label className="flex items-start gap-2 text-sm" htmlFor="sc-connected">
          <input
            id="sc-connected"
            type="checkbox"
            className="mt-1"
            checked={draft.connected}
            onChange={(event) => onToggle("connected", event.target.checked)}
          />
          <span>
            <span className="block font-medium">GitHub App installed</span>
            <span className="hint">
              Turn on after installing the App; BYOV can then create repos
              under the account below.
            </span>
          </span>
        </label>

        <div className="field">
          <span className="field-label" id="sc-account-type-label">
            Account type
          </span>
          <div
            role="radiogroup"
            aria-labelledby="sc-account-type-label"
            className="grid gap-2"
          >
            {GITHUB_ACCOUNT_TYPES.map((type) => (
              <label key={type} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="sc-account-type"
                  value={type}
                  checked={draft.accountType === type}
                  onChange={() => onAccountType(type)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">
                    {GITHUB_ACCOUNT_TYPE_META[type].label}
                  </span>
                  <span className="hint">
                    {GITHUB_ACCOUNT_TYPE_META[type].blurb}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <FieldError id="sc-account-type-error" message={errors.accountType} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label className="field-label" htmlFor="sc-account-login">
              {draft.accountType === "organization"
                ? "Organization login"
                : "GitHub username"}
            </label>
            <input
              id="sc-account-login"
              className="input mono"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={
                draft.accountType === "organization" ? "acme-labs" : "ada-dev"
              }
              value={draft.accountLogin}
              aria-invalid={Boolean(errors.accountLogin)}
              aria-describedby={
                errors.accountLogin
                  ? "sc-account-login-error"
                  : "sc-account-login-hint"
              }
              onChange={(event) => onText("accountLogin", event.target.value)}
            />
            <p id="sc-account-login-hint" className="hint">
              The owner every new repo is created under, e.g.{" "}
              <span className="mono">github.com/{draft.accountLogin || "acme-labs"}/…</span>
            </p>
            <FieldError
              id="sc-account-login-error"
              message={errors.accountLogin}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="sc-installation-id">
              Installation ID <span className="hint">(optional)</span>
            </label>
            <input
              id="sc-installation-id"
              className="input mono"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="12345678"
              value={draft.installationId}
              aria-invalid={Boolean(errors.installationId)}
              aria-describedby={
                errors.installationId
                  ? "sc-installation-id-error"
                  : "sc-installation-id-hint"
              }
              onChange={(event) => onText("installationId", event.target.value)}
            />
            <p id="sc-installation-id-hint" className="hint">
              From GitHub → Settings → Installations. Helps support verify
              the link.
            </p>
            <FieldError
              id="sc-installation-id-error"
              message={errors.installationId}
            />
          </div>
        </div>

        <ol className="grid list-decimal gap-1.5 pl-5 text-sm" style={{ color: "var(--color-ink-2)" }}>
          <li>
            In GitHub, install the BYOV App on the{" "}
            {draft.accountType === "organization" ? "Organization" : "account"}{" "}
            above and grant <span className="mono">Administration: write</span>{" "}
            for repositories.
          </li>
          <li>Enter the owner login (and installation ID if shown) here and save.</li>
          <li>
            New apps then get a repo automatically — private by default,
            named with the taxonomy below.
          </li>
        </ol>
      </section>

      <section
        aria-labelledby="sc-rules-heading"
        className="card grid gap-6 p-5 sm:p-6"
      >
        <div className="max-w-2xl">
          <h2
            id="sc-rules-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Repo creation rules
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Guardrails every new repo inherits. Private is the safe
            default — public needs an explicit opt-in.
          </p>
        </div>

        <div className="field">
          <span className="field-label" id="sc-visibility-label">
            Default visibility
          </span>
          <div
            role="radiogroup"
            aria-labelledby="sc-visibility-label"
            aria-describedby={
              errors.defaultVisibility
                ? "sc-visibility-error"
                : "sc-visibility-hint"
            }
            className="grid gap-2"
          >
            {REPO_VISIBILITIES.map((visibility) => (
              <label key={visibility} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="sc-visibility"
                  value={visibility}
                  checked={draft.defaultVisibility === visibility}
                  onChange={() => onVisibility(visibility)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium capitalize">{visibility}</span>
                  <span className="hint">
                    {visibility === "private"
                      ? "Only the account and invited collaborators can see the code."
                      : "Anyone on the internet can see the code."}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p id="sc-visibility-hint" className="hint">
            Applies to every repo BYOV creates. Existing repos keep their
            own visibility.
          </p>
          <FieldError id="sc-visibility-error" message={errors.defaultVisibility} />
        </div>

        <label className="flex items-start gap-2 text-sm" htmlFor="sc-allow-public">
          <input
            id="sc-allow-public"
            type="checkbox"
            className="mt-1"
            checked={draft.allowPublicRepos}
            onChange={(event) => onToggle("allowPublicRepos", event.target.checked)}
          />
          <span>
            <span className="block font-medium">Allow public repos</span>
            <span className="hint">
              Off keeps every new repo private. On only unlocks choosing
              public as the default above.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm" htmlFor="sc-auto-create">
          <input
            id="sc-auto-create"
            type="checkbox"
            className="mt-1"
            checked={draft.autoCreateRepo}
            onChange={(event) => onToggle("autoCreateRepo", event.target.checked)}
          />
          <span>
            <span className="block font-medium">
              Create a repo when an app is created
            </span>
            <span className="hint">
              The New app form previews the repo and links it on create.
              Turn off to link repos manually per app.
            </span>
          </span>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label className="field-label" htmlFor="sc-default-branch">
              Default branch
            </label>
            <input
              id="sc-default-branch"
              className="input mono max-w-[12rem]"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={draft.defaultBranch}
              aria-invalid={Boolean(errors.defaultBranch)}
              aria-describedby={
                errors.defaultBranch
                  ? "sc-default-branch-error"
                  : "sc-default-branch-hint"
              }
              onChange={(event) => onText("defaultBranch", event.target.value)}
            />
            <p id="sc-default-branch-hint" className="hint">
              Branch the pipeline watches for new repos.
            </p>
            <FieldError id="sc-default-branch-error" message={errors.defaultBranch} />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="sc-topics">
              Topics <span className="hint">(optional)</span>
            </label>
            <input
              id="sc-topics"
              className="input mono"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="byov, internal-tools"
              value={draft.topics}
              aria-invalid={Boolean(errors.topics)}
              aria-describedby={errors.topics ? "sc-topics-error" : "sc-topics-hint"}
              onChange={(event) => onText("topics", event.target.value)}
            />
            <p id="sc-topics-hint" className="hint">
              Comma-separated, added to every new repo for discovery.
            </p>
            <FieldError id="sc-topics-error" message={errors.topics} />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="sc-taxonomy-heading"
        className="card grid gap-6 p-5 sm:p-6"
      >
        <div className="max-w-2xl">
          <h2
            id="sc-taxonomy-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Naming taxonomy
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            Every repo follows one pattern so the org stays scannable.
            Edit the pattern to match your taxonomy — keep{" "}
            <span className="mono">{APP_SLUG_TOKEN}</span> where the app
            slug goes.
          </p>
        </div>

        <div className="field max-w-xl">
          <label className="field-label" htmlFor="sc-repo-pattern">
            Repo name pattern
          </label>
          <input
            id="sc-repo-pattern"
            className="input mono"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={DEFAULT_REPO_PATTERN}
            value={draft.repoPattern}
            aria-invalid={Boolean(errors.repoPattern)}
            aria-describedby={
              errors.repoPattern ? "sc-repo-pattern-error" : "sc-repo-pattern-hint"
            }
            onChange={(event) => onText("repoPattern", event.target.value)}
          />
          <p id="sc-repo-pattern-hint" className="hint">
            Prefilled with the proposed taxonomy{" "}
            <span className="mono">{DEFAULT_REPO_PATTERN}</span> (the{" "}
            <span className="mono">byov-</span> prefix marks vibe-coded
            apps governed here). Change it freely, e.g.{" "}
            <span className="mono">apps-{"{app-slug}"}</span> or just{" "}
            <span className="mono">{"{app-slug}"}</span>. Lowercase
            letters, numbers, dots, underscores or hyphens around the
            token. Preview below uses{" "}
            <span className="mono">{PREVIEW_SLUG}</span>.
          </p>
          <FieldError id="sc-repo-pattern-error" message={errors.repoPattern} />
        </div>

        <div
          className="grid gap-1 p-4 text-sm"
          style={{
            background: "var(--color-paper)",
            border: "1px solid var(--color-rule)",
            borderRadius: "var(--radius-card)",
          }}
        >
          <p>
            <span style={{ color: "var(--color-muted)" }}>Repo: </span>
            <span className="mono font-medium">{fullName}</span>{" "}
            <span className="mono" style={{ color: "var(--color-muted)" }}>
              ({repoName})
            </span>
          </p>
          <p style={{ color: "var(--color-ink-2)" }}>
            Visibility:{" "}
            <span className="font-medium capitalize">{draft.defaultVisibility}</span>
            {" · "}Branch: <span className="mono">{draft.defaultBranch || "main"}</span>
            {" · "}
            {ready
              ? draft.autoCreateRepo
                ? "Will be created automatically for new apps."
                : "Ready — create repos manually per app."
              : "Link the GitHub App above to enable creation."}
          </p>
          {draft.accountLogin.trim() && (
            <p className="mono text-[13px]" style={{ color: "var(--color-muted)" }}>
              https://github.com/{fullName}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
