// Server-side workspace store: managed nodes, workspace settings,
// workspace apps, custom stacks, users and auth settings in Postgres.
// Node-only (imports `pg` via `@/lib/db`): never import from client
// components or middleware. All validation and building rules come from
// the pure domain modules (lib/settings, lib/apps, lib/stacks,
// lib/users, lib/auth-settings) so the API enforces exactly what the UI
// validates: slug immutability, the node-removal guard, the last-admin
// guard and the governed gates. Only workspace rows are served; sample
// data stays UI-side (consulted only for referential checks).

import "@/db/migrations/0003_workspace";
import "@/db/migrations/0004_unify_apps";
import { query, queryOne } from "@/lib/db";
import type { App, Node } from "@/lib/control-plane";
import { listApps, listNodes } from "@/lib/control-plane";
import {
  buildApp,
  parseStoredApps,
  validateAppDraft,
  type AppDraft,
  type AppFieldErrors,
} from "@/lib/apps";
import {
  defaultAuthSettings,
  normalizeList,
  parseStoredAuthSettings,
  validateAuthSettings,
  type AuthSettings,
  type AuthSettingsFieldErrors,
} from "@/lib/auth-settings";
import {
  buildNode,
  defaultWorkspaceSettings,
  parseStoredNodes,
  parseStoredSettings,
  removeNodeGuarded,
  validateNodeDraft,
  validateWorkspaceSettings,
  type NodeDraft,
  type NodeFieldErrors,
  type NodeUsageEntry,
  type WorkspaceFieldErrors,
  type WorkspaceSettings,
} from "@/lib/settings";
import {
  buildStack,
  listStacks,
  parseStoredStacks,
  validateStackDraft,
  type StackDraft,
  type StackFieldErrors,
  type TechStack,
} from "@/lib/stacks";
import {
  inviteUser,
  parseStoredUsers,
  removeUser,
  setUserRole,
  type User,
  type UserRole,
} from "@/lib/users";
import { recordEvent } from "@/lib/events";
import {
  deleteNodeToken,
  listTokenSlugs,
  saveNodeToken,
} from "@/lib/node-credentials";

interface DocRow {
  data: unknown;
}

// --- Managed nodes -------------------------------------------------------

/** Attach server-side `hasApiToken` flags (tokens never serialize). */
async function withTokenFlags(nodes: Node[]): Promise<Node[]> {
  if (nodes.length === 0) {
    return nodes;
  }
  const slugs = await listTokenSlugs();
  if (slugs.size === 0) {
    return nodes;
  }
  return nodes.map((node) =>
    slugs.has(node.slug) ? { ...node, hasApiToken: true } : node,
  );
}

/** Every workspace node, ordered by slug. Empty until nodes are created. */
export async function listWorkspaceNodes(): Promise<Node[]> {
  const rows = await query<DocRow>(
    "SELECT data FROM workspace_nodes ORDER BY slug ASC",
  );
  const nodes = parseStoredNodes(rows.map((row) => row.data)) ?? [];
  return withTokenFlags(nodes);
}

export type NodeWriteResult =
  | { ok: true; node: Node }
  | { ok: false; errors: NodeFieldErrors };

export type MaybeNodeWriteResult =
  | NodeWriteResult
  | { ok: false; notFound: true };

export type NodeDeleteResult =
  | { ok: true }
  | { ok: false; notFound: true }
  | { ok: false; error: string; usage: NodeUsageEntry[] };

/** Validate and insert; the slug derives from the name. */
export async function createWorkspaceNode(
  draft: NodeDraft,
): Promise<NodeWriteResult> {
  const existing = await listWorkspaceNodes();
  const errors = validateNodeDraft(draft, existing);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const node = buildNode(draft, existing);
  await query("INSERT INTO workspace_nodes (slug, data) VALUES ($1, $2)", [
    node.slug,
    JSON.stringify(node),
  ]);
  const apiToken = (draft.apiToken ?? "").trim();
  if (apiToken) {
    await saveNodeToken(node.slug, apiToken);
  }
  const [enriched] = await withTokenFlags([node]);
  return { ok: true, node: enriched ?? node };
}

/** Validate and replace by slug; the slug never changes. */
export async function updateWorkspaceNode(
  slug: string,
  draft: NodeDraft,
): Promise<MaybeNodeWriteResult> {
  const existing = await listWorkspaceNodes();
  const target = existing.find((node) => node.slug === slug);
  if (!target) {
    return { ok: false, notFound: true };
  }
  const errors = validateNodeDraft(draft, existing, slug);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const endpoint = draft.endpoint.trim();
  const domainZone = draft.domainZone.trim().toLowerCase();
  const tailnetHost = draft.tailnetHost.trim().toLowerCase();
  const updated: Node = {
    ...target,
    name: draft.name.trim(),
    kind: draft.kind,
    location: draft.location.trim(),
  };
  if (endpoint) {
    updated.endpoint = endpoint;
  } else {
    delete updated.endpoint;
  }
  if (domainZone) {
    updated.domainZone = domainZone;
  } else {
    delete updated.domainZone;
  }
  if (tailnetHost) {
    updated.tailnetHost = tailnetHost;
  } else {
    delete updated.tailnetHost;
  }
  delete updated.hasApiToken;
  await query(
    "UPDATE workspace_nodes SET data = $1, updated_at = now() WHERE slug = $2",
    [JSON.stringify(updated), slug],
  );
  const apiToken = (draft.apiToken ?? "").trim();
  if (apiToken) {
    await saveNodeToken(slug, apiToken);
  } else if (draft.clearApiToken) {
    await deleteNodeToken(slug).catch(() => undefined);
  }
  const [enriched] = await withTokenFlags([updated]);
  return { ok: true, node: enriched ?? updated };
}

/** Mark a workspace node healthy after first adapter contact. */
export async function touchWorkspaceNode(slug: string): Promise<void> {
  const nodes = await listWorkspaceNodes();
  const target = nodes.find((node) => node.slug === slug);
  if (!target || target.status !== "pending") {
    return;
  }
  await query(
    "UPDATE workspace_nodes SET data = $1, updated_at = now() WHERE slug = $2",
    [JSON.stringify({ ...target, status: "healthy" }), slug],
  );
}

/** Remove unless environments are pinned to the node. */
export async function deleteWorkspaceNode(
  slug: string,
): Promise<NodeDeleteResult> {
  const nodes = await listWorkspaceNodes();
  const apps = [...listApps(), ...(await listWorkspaceApps())];
  const result = removeNodeGuarded(nodes, slug, apps);
  if (!result.ok) {
    if (!nodes.some((node) => node.slug === slug)) {
      return { ok: false, notFound: true };
    }
    return { ok: false, error: result.reason, usage: result.usage };
  }
  await query("DELETE FROM workspace_nodes WHERE slug = $1", [slug]);
  await deleteNodeToken(slug).catch(() => undefined);
  return { ok: true };
}

// --- Workspace settings (singleton) --------------------------------------

const SETTINGS_KEY = "settings";

/** Stored settings, or the defaults when nothing is saved yet. */
export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  const row = await queryOne<DocRow>(
    "SELECT data FROM workspace_kv WHERE key = $1",
    [SETTINGS_KEY],
  );
  return (row && parseStoredSettings(row.data)) ?? defaultWorkspaceSettings();
}

export type SettingsWriteResult =
  | { ok: true; settings: WorkspaceSettings }
  | { ok: false; errors: WorkspaceFieldErrors };

/** Validate against every known node (samples plus workspace) and save. */
export async function saveWorkspaceSettings(
  draft: WorkspaceSettings,
): Promise<SettingsWriteResult> {
  const nodes = [...listNodes(), ...(await listWorkspaceNodes())];
  const errors = validateWorkspaceSettings(draft, nodes);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const next: WorkspaceSettings = {
    workspaceName: draft.workspaceName.trim(),
    defaultNode: draft.defaultNode,
    devZone: draft.devZone.trim().toLowerCase(),
    tailnetDomain: draft.tailnetDomain.trim().toLowerCase(),
    defaultScenario: draft.defaultScenario,
    appScenarios: draft.appScenarios,
  };
  await query(
    `INSERT INTO workspace_kv (key, data) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(next)],
  );
  return { ok: true, settings: next };
}

// --- Workspace apps (single source of truth for every app) ---------------
// `workspace_apps` is the canonical store: browser-created apps
// (`/api/workspace/apps`) and machine-API apps (`/api/v1/apps`) read
// and write the same rows, so an app is visible from both surfaces
// the moment it is created. Sample apps stay UI-side fixtures and are
// never persisted. Migration 0004 backfilled any `api_apps`-only rows.

/** Every persisted app, ordered by slug. Samples stay UI-side. */
export async function listWorkspaceApps(): Promise<App[]> {
  const rows = await query<DocRow>(
    "SELECT data FROM workspace_apps ORDER BY slug ASC",
  );
  return parseStoredApps(rows.map((row) => row.data)) ?? [];
}

/** One persisted app by slug, or undefined. Corrupt rows miss cleanly. */
export async function findWorkspaceApp(
  slug: string,
): Promise<App | undefined> {
  const row = await queryOne<DocRow>(
    "SELECT data FROM workspace_apps WHERE slug = $1",
    [slug],
  );
  if (!row) {
    return undefined;
  }
  return parseStoredApps([row.data])?.[0];
}

/** Replace the stored document for an existing app (env mutations). */
export async function saveWorkspaceApp(app: App): Promise<void> {
  await query(
    "UPDATE workspace_apps SET data = $1, updated_at = now() WHERE slug = $2",
    [JSON.stringify(app), app.slug],
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export type AppWriteResult =
  | { ok: true; app: App }
  | { ok: false; errors: AppFieldErrors };

export type AppDeleteResult = { ok: true } | { ok: false; notFound: true };

/**
 * Validate and insert. Names and slugs clash against samples too (the
 * UI shows one merged list), and the Sandbox node may be a sample node.
 */
export async function createWorkspaceApp(
  draft: AppDraft,
): Promise<AppWriteResult> {
  const customs = await listWorkspaceApps();
  const existing = [...listApps(), ...customs];
  const nodes = [...listNodes(), ...(await listWorkspaceNodes())];
  const stacks = [...listStacks(), ...(await listWorkspaceStacks())];
  const errors = validateAppDraft(
    draft,
    existing,
    nodes,
    stacks.map((stack) => stack.slug),
  );
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const app = buildApp(draft, existing);
  try {
    await query("INSERT INTO workspace_apps (slug, data) VALUES ($1, $2)", [
      app.slug,
      JSON.stringify(app),
    ]);
  } catch (error) {
    // Lost a race with a concurrent create for the same slug: report
    // the conflict the same way validation does.
    if (isUniqueViolation(error)) {
      const raced = [...listApps(), ...(await listWorkspaceApps())];
      const racedErrors = validateAppDraft(draft, raced, nodes, stacks.map((s) => s.slug));
      return {
        ok: false,
        errors:
          Object.keys(racedErrors).length > 0
            ? racedErrors
            : { slug: "An app with this slug already exists." },
      };
    }
    throw error;
  }
  await recordEvent({
    actor: "BYOV",
    text: `registered ${app.name} with a Sandbox environment`,
    appSlug: app.slug,
  });
  return { ok: true, app };
}

/** Remove a workspace app; sample slugs are not found. */
export async function deleteWorkspaceApp(
  slug: string,
): Promise<AppDeleteResult> {
  const row = await queryOne<{ slug: string }>(
    "SELECT slug FROM workspace_apps WHERE slug = $1",
    [slug],
  );
  if (!row) {
    return { ok: false, notFound: true };
  }
  await query("DELETE FROM workspace_apps WHERE slug = $1", [slug]);
  return { ok: true };
}

// --- Custom stacks -------------------------------------------------------

/** Every workspace stack, ordered by slug. Shipped catalog stays UI-side. */
export async function listWorkspaceStacks(): Promise<TechStack[]> {
  const rows = await query<DocRow>(
    "SELECT data FROM workspace_stacks ORDER BY slug ASC",
  );
  return parseStoredStacks(rows.map((row) => row.data)) ?? [];
}

export type StackWriteResult =
  | { ok: true; stack: TechStack }
  | { ok: false; errors: StackFieldErrors };

export type MaybeStackWriteResult =
  | StackWriteResult
  | { ok: false; notFound: true };

export type StackDeleteResult = { ok: true } | { ok: false; notFound: true };

/**
 * Validate and insert. Names clash against the shipped catalog too (the
 * UI shows one merged list); checks keep the five governed gates.
 */
export async function createWorkspaceStack(
  draft: StackDraft,
): Promise<StackWriteResult> {
  const customs = await listWorkspaceStacks();
  const existing = [...listStacks(), ...customs];
  const errors = validateStackDraft(draft, existing);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const stack = buildStack(draft, existing);
  await query("INSERT INTO workspace_stacks (slug, data) VALUES ($1, $2)", [
    stack.slug,
    JSON.stringify(stack),
  ]);
  return { ok: true, stack };
}

/**
 * Validate and replace a custom stack by slug; the slug never changes.
 * Shipped stacks are read-only — clone them instead.
 */
export async function updateWorkspaceStack(
  slug: string,
  draft: StackDraft,
): Promise<MaybeStackWriteResult> {
  const customs = await listWorkspaceStacks();
  const target = customs.find((stack) => stack.slug === slug);
  if (!target) {
    return { ok: false, notFound: true };
  }
  const existing = [...listStacks(), ...customs];
  const errors = validateStackDraft(draft, existing, slug);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const rebuilt = buildStack(
    draft,
    existing.filter((stack) => stack.slug !== slug),
  );
  const starterRef = draft.starterRef.trim() || `custom:${slug}`;
  const updated: TechStack = {
    ...rebuilt,
    slug,
    starter: { ...rebuilt.starter, ref: starterRef },
  };
  await query(
    "UPDATE workspace_stacks SET data = $1, updated_at = now() WHERE slug = $2",
    [JSON.stringify(updated), slug],
  );
  return { ok: true, stack: updated };
}

/** Remove a custom stack; shipped slugs are not found. */
export async function deleteWorkspaceStack(
  slug: string,
): Promise<StackDeleteResult> {
  const row = await queryOne<{ slug: string }>(
    "SELECT slug FROM workspace_stacks WHERE slug = $1",
    [slug],
  );
  if (!row) {
    return { ok: false, notFound: true };
  }
  await query("DELETE FROM workspace_stacks WHERE slug = $1", [slug]);
  return { ok: true };
}

// --- Users ---------------------------------------------------------------

/** Every workspace user, ordered by id. */
export async function listWorkspaceUsers(): Promise<User[]> {
  const rows = await query<DocRow>(
    "SELECT data FROM workspace_users ORDER BY id ASC",
  );
  return parseStoredUsers(rows.map((row) => row.data));
}

export type UserInviteResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export type UserMutateResult =
  | { ok: true; users: User[] }
  | { ok: false; error: string }
  | { ok: false; notFound: true };

/** Invite by email; addresses compare case-insensitively. */
export async function inviteWorkspaceUser(
  email: string,
  role: UserRole,
): Promise<UserInviteResult> {
  const users = await listWorkspaceUsers();
  const result = inviteUser(users, email, role);
  if (!result.ok) {
    return result;
  }
  await query("INSERT INTO workspace_users (id, data) VALUES ($1, $2)", [
    result.user.id,
    JSON.stringify(result.user),
  ]);
  return { ok: true, user: result.user };
}

/** Change a role unless it demotes the last admin. */
export async function setWorkspaceUserRole(
  id: string,
  role: UserRole,
): Promise<UserMutateResult> {
  const users = await listWorkspaceUsers();
  if (!users.some((user) => user.id === id)) {
    return { ok: false, notFound: true };
  }
  const result = setUserRole(users, id, role);
  if (!result.ok) {
    return result;
  }
  const updated = result.users.find((user) => user.id === id);
  if (updated) {
    await query(
      "UPDATE workspace_users SET data = $1, updated_at = now() WHERE id = $2",
      [JSON.stringify(updated), id],
    );
  }
  return { ok: true, users: result.users };
}

/** Remove a user unless they are the last admin. */
export async function removeWorkspaceUser(
  id: string,
): Promise<UserMutateResult> {
  const users = await listWorkspaceUsers();
  if (!users.some((user) => user.id === id)) {
    return { ok: false, notFound: true };
  }
  const result = removeUser(users, id);
  if (!result.ok) {
    return result;
  }
  await query("DELETE FROM workspace_users WHERE id = $1", [id]);
  return { ok: true, users: result.users };
}

// --- Auth settings (singleton) -------------------------------------------

const AUTH_SETTINGS_KEY = "auth_settings";

/** Stored auth settings, or the defaults when nothing is saved yet. */
export async function getWorkspaceAuthSettings(): Promise<AuthSettings> {
  const row = await queryOne<DocRow>(
    "SELECT data FROM workspace_kv WHERE key = $1",
    [AUTH_SETTINGS_KEY],
  );
  if (!row) {
    return defaultAuthSettings();
  }
  return parseStoredAuthSettings(row.data);
}

export type AuthSettingsWriteResult =
  | { ok: true; settings: AuthSettings }
  | { ok: false; errors: AuthSettingsFieldErrors };

/** Validate, normalize the comma lists, and save. */
export async function saveWorkspaceAuthSettings(
  draft: AuthSettings,
): Promise<AuthSettingsWriteResult> {
  const errors = validateAuthSettings(draft);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const next: AuthSettings = {
    passwordlessEnabled: draft.passwordlessEnabled,
    magicLinkEnabled: draft.magicLinkEnabled,
    providers: { ...draft.providers },
    allowedEmails: normalizeList(draft.allowedEmails),
    allowedDomains: normalizeList(draft.allowedDomains).toLowerCase(),
    adminEmails: normalizeList(draft.adminEmails),
    sessionLifetimeHours: draft.sessionLifetimeHours,
  };
  await query(
    `INSERT INTO workspace_kv (key, data) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [AUTH_SETTINGS_KEY, JSON.stringify(next)],
  );
  return { ok: true, settings: next };
}
