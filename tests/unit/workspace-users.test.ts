import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db");

import { query, queryOne } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import type { UserRole } from "@/lib/users";
import {
  inviteWorkspaceUser,
  listWorkspaceUsers,
  removeWorkspaceUser,
  setWorkspaceUserRole,
} from "@/lib/workspace-store";
import {
  GET as usersGet,
  POST as usersPost,
} from "@/app/api/workspace/users/route";
import {
  DELETE as userDelete,
  PATCH as userPatch,
} from "@/app/api/workspace/users/[id]/route";

// In-memory Postgres double: the store JSON-serializes each document and
// the fake parses on read, exactly like node-pg does for JSONB columns.
const tables: Record<string, Map<string, string>> = {
  workspace_nodes: new Map(),
  workspace_apps: new Map(),
  workspace_stacks: new Map(),
  workspace_users: new Map(),
  workspace_kv: new Map(),
};

function tableOf(sql: string): Map<string, string> {
  for (const name of Object.keys(tables)) {
    if (sql.includes(name)) {
      return tables[name];
    }
  }
  throw new Error(`unexpected SQL: ${sql}`);
}

async function fakeQuery(
  text: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  const table = tableOf(text);
  const sql = text.trimStart().toUpperCase();
  if (sql.startsWith("SELECT")) {
    return [...table.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, value]) => ({ data: JSON.parse(value) }));
  }
  if (sql.startsWith("INSERT")) {
    table.set(String(params[0]), String(params[1]));
    return [];
  }
  if (sql.startsWith("UPDATE")) {
    table.set(String(params[1]), String(params[0]));
    return [];
  }
  if (sql.startsWith("DELETE")) {
    table.delete(String(params[0]));
    return [];
  }
  throw new Error(`unexpected SQL: ${text}`);
}

async function fakeQueryOne(
  text: string,
  params: unknown[] = [],
): Promise<Record<string, unknown> | null> {
  const table = tableOf(text);
  const value = table.get(String(params[0]));
  if (value === undefined) {
    return null;
  }
  const key = String(params[0]);
  return { slug: key, id: key, data: JSON.parse(value) };
}

const savedSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  for (const table of Object.values(tables)) {
    table.clear();
  }
  vi.mocked(query).mockImplementation(async (text, params) => {
    return (await fakeQuery(text, params ?? [])) as never[];
  });
  vi.mocked(queryOne).mockImplementation(async (text, params) => {
    return (await fakeQueryOne(text, params ?? [])) as never;
  });
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = savedSecret;
  }
});

describe("workspace users store", () => {
  it("invites a user with a normalized email", async () => {
    const result = await inviteWorkspaceUser("Ada@Example.com", "member");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.user.email).toBe("ada@example.com");
    expect(result.user.role).toBe("member");
    await expect(listWorkspaceUsers()).resolves.toEqual([result.user]);
  });

  it("rejects duplicate and invalid emails", async () => {
    await inviteWorkspaceUser("ada@example.com", "member");
    await expect(
      inviteWorkspaceUser("ADA@example.com", "admin"),
    ).resolves.toEqual({
      ok: false,
      error: "ada@example.com is already on the list.",
    });
    await expect(inviteWorkspaceUser("not-an-email", "member")).resolves.toEqual(
      {
        ok: false,
        error: '"not-an-email" is not a valid email address.',
      },
    );
  });

  it("changes roles but never demotes the last admin", async () => {
    const admin = await inviteWorkspaceUser("admin@example.com", "admin");
    const member = await inviteWorkspaceUser("ada@example.com", "member");
    expect(admin.ok && member.ok).toBe(true);
    if (!admin.ok || !member.ok) {
      return;
    }
    const promoted = await setWorkspaceUserRole(member.user.id, "admin");
    expect(promoted.ok).toBe(true);
    const demoted = await setWorkspaceUserRole(admin.user.id, "member");
    expect(demoted.ok).toBe(true);
    const lastDemote = await setWorkspaceUserRole(member.user.id, "member");
    expect(lastDemote).toEqual({
      ok: false,
      error: "Cannot demote the last admin.",
    });
    await expect(
      setWorkspaceUserRole("no-such-id", "admin"),
    ).resolves.toEqual({ ok: false, notFound: true });
  });

  it("removes users but never the last admin", async () => {
    const admin = await inviteWorkspaceUser("admin@example.com", "admin");
    const member = await inviteWorkspaceUser("ada@example.com", "member");
    expect(admin.ok && member.ok).toBe(true);
    if (!admin.ok || !member.ok) {
      return;
    }
    await expect(removeWorkspaceUser(member.user.id)).resolves.toEqual({
      ok: true,
      users: [admin.user],
    });
    await expect(removeWorkspaceUser(admin.user.id)).resolves.toEqual({
      ok: false,
      error: "Cannot remove the last admin.",
    });
    await expect(removeWorkspaceUser("no-such-id")).resolves.toEqual({
      ok: false,
      notFound: true,
    });
  });
});

async function sessionRequest(
  url: string,
  init: { method?: string; body?: unknown; role?: UserRole } = {},
): Promise<NextRequest> {
  const session = await createSession({
    email: "admin@example.com",
    provider: "passwordless",
    role: init.role ?? "member",
  });
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers: new Headers({ cookie: `${SESSION_COOKIE_NAME}=${session}` }),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function params(value: { id: string }) {
  return { params: Promise.resolve(value) };
}

describe("workspace users API", () => {
  it("is admin-only: 401 anonymous, 403 member", async () => {
    const anon = await usersGet(
      new NextRequest("http://localhost/api/workspace/users"),
    );
    expect(anon.status).toBe(401);

    const member = await usersGet(
      await sessionRequest("http://localhost/api/workspace/users"),
    );
    expect(member.status).toBe(403);
    expect(await member.json()).toEqual({
      ok: false,
      error: "Only admins can manage this.",
    });

    const memberPost = await usersPost(
      await sessionRequest("http://localhost/api/workspace/users", {
        method: "POST",
        body: { email: "ada@example.com", role: "member" },
      }),
    );
    expect(memberPost.status).toBe(403);
  });

  it("invites, re-roles and removes as admin", async () => {
    const invited = await usersPost(
      await sessionRequest("http://localhost/api/workspace/users", {
        method: "POST",
        body: { email: "ada@example.com", role: "admin" },
        role: "admin",
      }),
    );
    expect(invited.status).toBe(201);
    const created = (await invited.json()) as {
      ok: boolean;
      data: { id: string };
    };
    const id = created.data.id;

    const badRole = await usersPost(
      await sessionRequest("http://localhost/api/workspace/users", {
        method: "POST",
        body: { email: "bob@example.com", role: "owner" },
        role: "admin",
      }),
    );
    expect(badRole.status).toBe(400);

    const duplicate = await usersPost(
      await sessionRequest("http://localhost/api/workspace/users", {
        method: "POST",
        body: { email: "ada@example.com", role: "member" },
        role: "admin",
      }),
    );
    expect(duplicate.status).toBe(400);

    const demoteLast = await userPatch(
      await sessionRequest(`http://localhost/api/workspace/users/${id}`, {
        method: "PATCH",
        body: { role: "member" },
        role: "admin",
      }),
      params({ id }),
    );
    expect(demoteLast.status).toBe(400);

    const second = await usersPost(
      await sessionRequest("http://localhost/api/workspace/users", {
        method: "POST",
        body: { email: "bob@example.com", role: "admin" },
        role: "admin",
      }),
    );
    expect(second.status).toBe(201);

    const demoted = await userPatch(
      await sessionRequest(`http://localhost/api/workspace/users/${id}`, {
        method: "PATCH",
        body: { role: "member" },
        role: "admin",
      }),
      params({ id }),
    );
    expect(demoted.status).toBe(200);

    const removed = await userDelete(
      await sessionRequest(`http://localhost/api/workspace/users/${id}`, {
        method: "DELETE",
        role: "admin",
      }),
      params({ id }),
    );
    expect(removed.status).toBe(200);

    const missing = await userDelete(
      await sessionRequest(`http://localhost/api/workspace/users/${id}`, {
        method: "DELETE",
        role: "admin",
      }),
      params({ id }),
    );
    expect(missing.status).toBe(404);
  });
});
