// Pure source-control logic: workspace GitHub connection and the repo
// creation taxonomy. No DOM access here so every rule stays
// unit-testable; lib/source-control-store.ts owns the hook and
// lib/workspace-store.ts persists the same shape server-side.
//
// The connection is a GitHub App installation on a personal (User) or
// Organization account. BYOV never stores a token in this document —
// the installation id is the durable handle; the App's private key
// stays in server env / the Factory secret store.

export const SOURCE_CONTROL_STORAGE_KEY = "byov:source-control:v1";

export const GITHUB_ACCOUNT_TYPES = ["user", "organization"] as const;
export type GitHubAccountType = (typeof GITHUB_ACCOUNT_TYPES)[number];

/** Code-repository providers. Only GitHub connects today. */
export const REPO_PROVIDERS = ["github"] as const;
export type RepoProvider = (typeof REPO_PROVIDERS)[number];
export const REPO_PROVIDER_META: Record<
  RepoProvider,
  { label: string; blurb: string }
> = {
  github: {
    label: "GitHub",
    blurb: "Repos under a personal account or Organization via the BYOV GitHub App.",
  },
};

export const GITHUB_ACCOUNT_TYPE_META: Record<
  GitHubAccountType,
  { label: string; blurb: string }
> = {
  user: {
    label: "Personal account",
    blurb: "Repos land under your GitHub username.",
  },
  organization: {
    label: "Organization",
    blurb: "Repos land under the org — teams, SSO and audit apply.",
  },
};

export const REPO_VISIBILITIES = ["private", "public"] as const;
export type RepoVisibility = (typeof REPO_VISIBILITIES)[number];

export const MAX_LOGIN_LENGTH = 39;
export const MAX_AFFIX_LENGTH = 30;
export const MAX_REPO_NAME_LENGTH = 100;
export const MAX_TOPIC_LENGTH = 50;
export const MAX_BRANCH_LENGTH = 100;

/** Token in the repo-name pattern where the app slug lands. */
export const APP_SLUG_TOKEN = "{app-slug}";
export const DEFAULT_REPO_PATTERN = `byov-${APP_SLUG_TOKEN}`;

export interface SourceControlSettings {
  /** Provider hosting code repositories (GitHub today). */
  provider: RepoProvider;
  /** True once a GitHub App installation is linked. */
  connected: boolean;
  accountType: GitHubAccountType;
  /** GitHub login (username or org), e.g. `acme-labs`. */
  accountLogin: string;
  /** GitHub App installation id (digits), or "" until installed. */
  installationId: string;
  /** Visibility every new repo starts with. Private by default. */
  defaultVisibility: RepoVisibility;
  /** When false, public repos cannot be chosen as the default. */
  allowPublicRepos: boolean;
  /**
   * Repo-name pattern with one `{app-slug}` token, e.g.
   * `byov-{app-slug}`. The single taxonomy field admins edit.
   */
  repoPattern: string;
  /** Derived prefix (before the token); kept for stored docs. */
  repoPrefix: string;
  /** Derived suffix (after the token); kept for stored docs. */
  repoSuffix: string;
  /** Branch new repos are created with. */
  defaultBranch: string;
  /** Create + link the repo automatically when an app is created. */
  autoCreateRepo: boolean;
  /** Raw comma-separated GitHub topics added to every new repo. */
  topics: string;
}

export function defaultSourceControlSettings(): SourceControlSettings {
  return {
    provider: "github",
    connected: false,
    accountType: "organization",
    accountLogin: "",
    installationId: "",
    defaultVisibility: "private",
    allowPublicRepos: false,
    repoPattern: DEFAULT_REPO_PATTERN,
    repoPrefix: "byov-",
    repoSuffix: "",
    defaultBranch: "main",
    autoCreateRepo: true,
    topics: "byov",
  };
}

export type SourceControlField =
  | "provider"
  | "connected"
  | "accountType"
  | "accountLogin"
  | "installationId"
  | "defaultVisibility"
  | "allowPublicRepos"
  | "repoPattern"
  | "repoPrefix"
  | "repoSuffix"
  | "defaultBranch"
  | "autoCreateRepo"
  | "topics";
export type SourceControlFieldErrors = Partial<
  Record<SourceControlField, string>
>;

const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const AFFIX_PATTERN = /^[a-z0-9._-]+$/;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** True for a valid GitHub username / org login. */
export function isGitHubLogin(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > MAX_LOGIN_LENGTH) return false;
  if (v.includes("--")) return false;
  return LOGIN_PATTERN.test(v);
}

/** True for a repo prefix/suffix the GitHub API accepts. */
export function isValidRepoAffix(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "") return true;
  if (v.length > MAX_AFFIX_LENGTH) return false;
  if (v === "." || v === "..") return false;
  return AFFIX_PATTERN.test(v);
}

/** Pattern from legacy affixes, e.g. `byov-` + `` → `byov-{app-slug}`. */
export function repoPatternFromAffixes(prefix: string, suffix: string): string {
  return `${prefix.trim().toLowerCase()}${APP_SLUG_TOKEN}${suffix.trim().toLowerCase()}`;
}

/** Split a pattern around its token; null when the shape is wrong. */
export function splitRepoPattern(
  pattern: string,
): { prefix: string; suffix: string } | null {
  const v = pattern.trim().toLowerCase();
  const parts = v.split(APP_SLUG_TOKEN);
  if (parts.length !== 2) return null;
  const [prefix, suffix] = parts as [string, string];
  if (!isValidRepoAffix(prefix) || !isValidRepoAffix(suffix)) return null;
  return { prefix, suffix };
}

/** True for a pattern with exactly one token and valid affixes. */
export function isValidRepoPattern(value: string): boolean {
  return splitRepoPattern(value) !== null;
}

/** Split a raw comma list into trimmed, non-empty entries. */
export function splitTopics(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** Normalize one comma list for storage: trimmed entries, raw order kept. */
export function normalizeTopics(value: string): string {
  return splitTopics(value).join(", ");
}

function topicsError(value: string): string | null {
  for (const topic of splitTopics(value)) {
    if (topic.length > MAX_TOPIC_LENGTH) {
      return `Keep each topic under ${MAX_TOPIC_LENGTH} characters.`;
    }
    if (!TOPIC_PATTERN.test(topic)) {
      return `"${topic}" is not a valid topic — lowercase letters, numbers and hyphens only.`;
    }
  }
  return null;
}

export function validateSourceControlSettings(
  draft: SourceControlSettings,
): SourceControlFieldErrors {
  const errors: SourceControlFieldErrors = {};

  if (!REPO_PROVIDERS.includes(draft.provider)) {
    errors.provider = "Choose a code repository provider.";
  }

  if (!GITHUB_ACCOUNT_TYPES.includes(draft.accountType)) {
    errors.accountType = "Choose a personal account or an Organization.";
  }

  const login = draft.accountLogin.trim();
  if (draft.connected && !login) {
    errors.accountLogin =
      draft.accountType === "organization"
        ? "Enter the Organization login, e.g. acme-labs."
        : "Enter your GitHub username, e.g. ada-dev.";
  } else if (login && !isGitHubLogin(login)) {
    errors.accountLogin =
      "Use 1–39 letters, numbers or single hyphens — no leading or trailing hyphen.";
  }

  const installationId = draft.installationId.trim();
  if (installationId && !/^\d+$/.test(installationId)) {
    errors.installationId = "Enter the numeric installation id from GitHub.";
  } else if (installationId.length > 20) {
    errors.installationId = "Keep the installation id under 20 digits.";
  }

  if (!REPO_VISIBILITIES.includes(draft.defaultVisibility)) {
    errors.defaultVisibility = "Choose private or public.";
  } else if (draft.defaultVisibility === "public" && !draft.allowPublicRepos) {
    errors.defaultVisibility =
      "Public repos are disabled — keep the default private or allow public repos below.";
  }

  const pattern = (draft.repoPattern ?? "").trim().toLowerCase();
  if (!pattern) {
    errors.repoPattern = `Enter a repo name pattern, e.g. ${DEFAULT_REPO_PATTERN}.`;
  } else if (!pattern.includes(APP_SLUG_TOKEN)) {
    errors.repoPattern = `Include ${APP_SLUG_TOKEN} where the app slug goes.`;
  } else if (!isValidRepoPattern(pattern)) {
    errors.repoPattern =
      "Use one {app-slug} token with lowercase letters, numbers, dots, underscores or hyphens around it (max 30 chars each side).";
  }

  const branch = draft.defaultBranch.trim();
  if (!branch) {
    errors.defaultBranch = "Enter the default branch, e.g. main.";
  } else if (
    branch.length > MAX_BRANCH_LENGTH ||
    !BRANCH_PATTERN.test(branch) ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.includes("..")
  ) {
    errors.defaultBranch = "Enter a branch name like main or develop.";
  }

  const topics = topicsError(draft.topics);
  if (topics) {
    errors.topics = topics;
  }

  return errors;
}

function sanitizeRepoSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Repo name for an app slug under the workspace taxonomy:
 * `{prefix}{app-slug}{suffix}`, sanitized to GitHub rules and
 * truncated to 100 chars without a dangling separator.
 */
export function resolveRepoName(
  settings: SourceControlSettings,
  appSlug: string,
): string {
  const split = splitRepoPattern(settings.repoPattern ?? "");
  const prefix = sanitizeRepoSegment(
    split ? split.prefix : (settings.repoPrefix ?? ""),
  );
  const suffix = sanitizeRepoSegment(
    split ? split.suffix : (settings.repoSuffix ?? ""),
  );
  const slug = sanitizeRepoSegment(appSlug || "app") || "app";
  let name = `${prefix}${slug}${suffix}`;
  name = name.replace(/^[-.]+/, "").replace(/[-.]+$/, "");
  if (!name || name === "." || name === "..") name = "app";
  if (name.length > MAX_REPO_NAME_LENGTH) {
    name = name
      .slice(0, MAX_REPO_NAME_LENGTH)
      .replace(/[-.]+$/, "");
  }
  return name;
}

/** `owner/repo` once an account is linked, else just the repo name. */
export function resolveRepoFullName(
  settings: SourceControlSettings,
  appSlug: string,
): string {
  const repo = resolveRepoName(settings, appSlug);
  const login = settings.accountLogin.trim();
  return login ? `${login}/${repo}` : repo;
}

/** Canonical https URL for the repo BYOV would create, or "" unlinked. */
export function resolveRepoUrl(
  settings: SourceControlSettings,
  appSlug: string,
): string {
  const login = settings.accountLogin.trim();
  if (!login) return "";
  return `https://github.com/${login}/${resolveRepoName(settings, appSlug)}`;
}

/** True when a linked installation can actually create repos. */
export function canCreateRepos(settings: SourceControlSettings): boolean {
  return (
    settings.connected && isGitHubLogin(settings.accountLogin)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse stored source-control settings with per-field fallback: every
 * field that is missing or misshapen falls back to its default, so a
 * corrupt entry can never break the form.
 */
export function parseStoredSourceControlSettings(
  value: unknown,
): SourceControlSettings {
  const defaults = defaultSourceControlSettings();
  if (!isRecord(value)) return defaults;
  const accountType = GITHUB_ACCOUNT_TYPES.includes(
    value.accountType as GitHubAccountType,
  )
    ? (value.accountType as GitHubAccountType)
    : defaults.accountType;
  const visibility = REPO_VISIBILITIES.includes(
    value.defaultVisibility as RepoVisibility,
  )
    ? (value.defaultVisibility as RepoVisibility)
    : defaults.defaultVisibility;
  const storedPrefix =
    typeof value.repoPrefix === "string" && isValidRepoAffix(value.repoPrefix)
      ? value.repoPrefix.trim().toLowerCase()
      : defaults.repoPrefix;
  const storedSuffix =
    typeof value.repoSuffix === "string" && isValidRepoAffix(value.repoSuffix)
      ? value.repoSuffix.trim().toLowerCase()
      : defaults.repoSuffix;
  const repoPattern =
    typeof value.repoPattern === "string" && isValidRepoPattern(value.repoPattern)
      ? value.repoPattern.trim().toLowerCase()
      : repoPatternFromAffixes(storedPrefix, storedSuffix);
  const derived = splitRepoPattern(repoPattern) ?? {
    prefix: storedPrefix,
    suffix: storedSuffix,
  };
  const provider = REPO_PROVIDERS.includes(value.provider as RepoProvider)
    ? (value.provider as RepoProvider)
    : defaults.provider;
  const login =
    typeof value.accountLogin === "string" ? value.accountLogin.trim() : "";
  const installationId =
    typeof value.installationId === "string"
      ? value.installationId.trim()
      : "";
  return {
    provider,
    connected:
      typeof value.connected === "boolean"
        ? value.connected
        : defaults.connected,
    accountType,
    accountLogin: isGitHubLogin(login) || login === "" ? login : "",
    installationId: /^\d*$/.test(installationId) ? installationId : "",
    defaultVisibility: visibility,
    allowPublicRepos:
      typeof value.allowPublicRepos === "boolean"
        ? value.allowPublicRepos
        : defaults.allowPublicRepos,
    repoPattern,
    repoPrefix: derived.prefix,
    repoSuffix: derived.suffix,
    defaultBranch:
      typeof value.defaultBranch === "string" && value.defaultBranch.trim()
        ? value.defaultBranch.trim()
        : defaults.defaultBranch,
    autoCreateRepo:
      typeof value.autoCreateRepo === "boolean"
        ? value.autoCreateRepo
        : defaults.autoCreateRepo,
    topics:
      typeof value.topics === "string" ? value.topics : defaults.topics,
  };
}

/** Normalized copy for persistence: trimmed login, lowered affixes/topics. */
export function normalizeSourceControlSettings(
  draft: SourceControlSettings,
): SourceControlSettings {
  const repoPattern = (
    draft.repoPattern ??
    repoPatternFromAffixes(draft.repoPrefix ?? "", draft.repoSuffix ?? "")
  )
    .trim()
    .toLowerCase();
  const derived = splitRepoPattern(repoPattern);
  return {
    provider: REPO_PROVIDERS.includes(draft.provider) ? draft.provider : "github",
    connected: draft.connected,
    accountType: draft.accountType,
    accountLogin: draft.accountLogin.trim(),
    installationId: draft.installationId.trim(),
    defaultVisibility: draft.defaultVisibility,
    allowPublicRepos: draft.allowPublicRepos,
    repoPattern,
    repoPrefix: derived ? derived.prefix : draft.repoPrefix.trim().toLowerCase(),
    repoSuffix: derived ? derived.suffix : draft.repoSuffix.trim().toLowerCase(),
    defaultBranch: draft.defaultBranch.trim() || "main",
    autoCreateRepo: draft.autoCreateRepo,
    topics: normalizeTopics(draft.topics),
  };
}
