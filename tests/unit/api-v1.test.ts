import { afterEach, beforeEach, describe, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  migrate: vi.fn(),
  registerMigration: vi.fn(),
  getMigrations: vi.fn(() => []),
  getDatabaseUrl: vi.fn(() => "postgres://localhost/test"),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import {
  GET as tokensGet,
  POST as tokensPost,
} from "@/app/api/v1/tokens/route";
import { DELETE as tokenDelete } from "@/app/api/v1/tokens/[id]/route";
import { GET as appsGet, POST as appsPost } from "@/app/api/v1/apps/route";
import { GET as appGet } from "@/app/api/v1/apps/[slug]/route";
import {
  GET as envsGet,
  POST as envsPost,
} from "@/app/api/v1/apps/[slug]/envs/route";
import { GET as envGet } from "@/app/api/v1/apps/[slug]/envs/[env]/route";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import type { App } from "@/lib/control-plane";

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);

interface FakeTokenRow {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** In-memory tables backing the mocked `query`/`queryOne`. */
const tokens = new Map<string, FakeTokenRow>();
const apps = new Map<string, { app: App; seq: number }>();
let nextSeq = 0;

/** Mirror `pg`: TIMESTAMPTZ columns arrive as Dates. */
function toPgTokenRow(row: FakeTokenRow) {
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.tokenHash,
    createdAt: new Date(row.createdAt),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
  };
}

async function fakeQuery(
  text: string,
  params: unknown[],
): Promise<unknown[]> {
  if (text.includes("FROM api_tokens")) {
    if (text.startsWith("SELECT 1")) {
      return tokens.size > 0 ? [{ one: 1 }] : [];
    }
    if (text.includes("WHERE id = $1")) {
      const row = tokens.get(String(params[0]));
      return row ? [toPgTokenRow(row)] : [];
    }
    return [...tokens.values()]
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .map(toPgTokenRow);
  }
  if (text.startsWith("INSERT INTO api_tokens")) {
    const [id, name, tokenHash, createdAt] = params as [
      string,
      string,
      string,
      string,
    ];
    tokens.set(id, {
      id,
      name,
      tokenHash,
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    });
    return [];
  }
  if (text.startsWith("UPDATE api_tokens SET last_used_at")) {
    const [lastUsedAt, id] = params as [string, string];
    const row = tokens.get(id);
    if (row) {
      row.lastUsedAt = lastUsedAt;
    }
    return [];
  }
  if (text.startsWith("UPDATE api_tokens SET revoked_at")) {
    const [revokedAt, id] = params as [string, string];
    const row = tokens.get(id);
    if (row) {
      row.revokedAt = revokedAt;
    }
    return [];
  }
  if (
    text.includes("FROM workspace_nodes") ||
    text.includes("FROM workspace_stacks")
  ) {
    return [];
  }
  if (text.includes("FROM workspace_apps") && text.startsWith("SELECT")) {
    if (text.includes("WHERE slug = $1")) {
      const entry = apps.get(String(params[0]));
      // Mirror `pg`: the JSONB document arrives parsed.
      return entry
        ? [
            {
              slug: entry.app.slug,
              data: JSON.parse(JSON.stringify(entry.app)),
            },
          ]
        : [];
    }
    return [...apps.values()]
      .sort((a, b) => a.app.slug.localeCompare(b.app.slug))
      .map((entry) => ({
        slug: entry.app.slug,
        data: JSON.parse(JSON.stringify(entry.app)),
      }));
  }
  if (text.startsWith("INSERT INTO workspace_apps")) {
    const [slug, json] = params as [string, string];
    nextSeq += 1;
    apps.set(slug, { app: JSON.parse(json) as App, seq: nextSeq });
    return [];
  }
  if (text.startsWith("UPDATE workspace_apps SET data")) {
    const [json, slug] = params as [string, string];
    const entry = apps.get(slug);
    if (entry) {
      entry.app = JSON.parse(json) as App;
    }
    return [];
  }
  throw new Error(`unexpected SQL in fake: ${text}`);
}

const savedEnv = { ...process.env };
const NODE = "coolify-frankfurt";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
  tokens.clear();
  apps.clear();
  nextSeq = 0;
  mockQuery.mockReset();
  mockQueryOne.mockReset();
  mockQuery.mockImplementation(async (text: string, params?: unknown[]) => {
    return fakeQuery(text, params ?? []);
  });
  mockQueryOne.mockImplementation(async (text: string, params?: unknown[]) => {
    const rows = await fakeQuery(text, params ?? []);
    return rows.length > 0 ? rows[0] : null;
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
});

function apiRequest(
  url: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    rawBody?: string;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (init.token) {
    headers.set("authorization", `Bearer ${init.token}`);
  }
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body:
      init.rawBody ??
      (init.body === undefined ? undefined : JSON.stringify(init.body)),
  });
}

async function adminRequest(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<NextRequest> {
  const session = await createSession({
    email: "admin@example.com",
    provider: "passwordless",
    role: "admin",
  });
  const headers = new Headers({
    cookie: `${SESSION_COOKIE_NAME}=${session}`,
  });
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

describe("tokens", () => {
  it("bootstraps the first token without auth, then requires auth", async () => {
    const first = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "bootstrap" },
      }),
    );
    expect(first.status).toBe(201);
    const created = (await first.json()) as {
      ok: boolean;
      data: { id: string; name: string; token: string };
    };
    expect(created.ok).toBe(true);
    expect(created.data.token.startsWith(`byov_${created.data.id}_`)).toBe(
      true,
    );

    const secondAnon = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "intruder" },
      }),
    );
    expect(secondAnon.status).toBe(401);

    const second = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        token: created.data.token,
        body: { name: "second" },
      }),
    );
    expect(second.status).toBe(201);
  });

  it("lists token metadata without secrets or hashes", async () => {
    const bootstrap = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "bootstrap" },
      }),
    );
    const { data } = (await bootstrap.json()) as {
      data: { token: string };
    };
    const listed = await tokensGet(
      apiRequest("http://localhost/api/v1/tokens", { token: data.token }),
    );
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      ok: boolean;
      data: Record<string, unknown>[];
    };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).not.toHaveProperty("token");
    expect(JSON.stringify(body)).not.toContain("tokenHash");

    const anon = await tokensGet(
      apiRequest("http://localhost/api/v1/tokens"),
    );
    expect(anon.status).toBe(401);
  });

  it("validates the token name", async () => {
    const response = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "  " },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      errors: { name: "Give the token a name." },
    });
  });

  it("revokes by id: the token 401s afterwards", async () => {
    const bootstrap = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "bootstrap" },
      }),
    );
    const { data } = (await bootstrap.json()) as {
      data: { id: string; token: string };
    };
    const revoked = await tokenDelete(
      apiRequest(`http://localhost/api/v1/tokens/${data.id}`, {
        method: "DELETE",
        token: data.token,
      }),
      params({ id: data.id }),
    );
    expect(revoked.status).toBe(200);

    const after = await appsGet(
      apiRequest("http://localhost/api/v1/apps", { token: data.token }),
    );
    expect(after.status).toBe(401);

    const unknown = await tokenDelete(
      await adminRequest(`http://localhost/api/v1/tokens/zzzzzzzzzzzz`, {
        method: "DELETE",
      }),
      params({ id: "zzzzzzzzzzzz" }),
    );
    expect(unknown.status).toBe(404);
  });
});

describe("apps", () => {
  async function bootstrapToken(): Promise<string> {
    const response = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "test" },
      }),
    );
    const { data } = (await response.json()) as { data: { token: string } };
    return data.token;
  }

  it("401s without credentials", async () => {
    expect(
      (await appsGet(apiRequest("http://localhost/api/v1/apps"))).status,
    ).toBe(401);
    expect(
      (
        await appsPost(
          apiRequest("http://localhost/api/v1/apps", {
            method: "POST",
            body: { name: "x" },
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("creates, lists and gets apps", async () => {
    const token = await bootstrapToken();
    const empty = await appsGet(
      apiRequest("http://localhost/api/v1/apps", { token }),
    );
    expect(await empty.json()).toEqual({ ok: true, data: [] });

    const created = await appsPost(
      apiRequest("http://localhost/api/v1/apps", {
        method: "POST",
        token,
        body: {
          name: "Rota Planner",
          description: "Shifts.",
          stack: "byov-stack",
          node: NODE,
        },
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      ok: boolean;
      data: { slug: string; envs: { name: string }[] };
    };
    expect(createdBody.data.slug).toBe("rota-planner");
    expect(createdBody.data.envs.map((env) => env.name)).toEqual(["sandbox"]);

    const listed = await appsGet(
      apiRequest("http://localhost/api/v1/apps", { token }),
    );
    const listedBody = (await listed.json()) as {
      data: { slug: string }[];
    };
    expect(listedBody.data.map((app) => app.slug)).toEqual(["rota-planner"]);

    const one = await appGet(
      apiRequest("http://localhost/api/v1/apps/rota-planner", { token }),
      params({ slug: "rota-planner" }),
    );
    expect(one.status).toBe(200);

    const missing = await appGet(
      apiRequest("http://localhost/api/v1/apps/nope", { token }),
      params({ slug: "nope" }),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false });
  });

  it("returns field errors and rejects bad JSON", async () => {
    const token = await bootstrapToken();
    const invalid = await appsPost(
      apiRequest("http://localhost/api/v1/apps", {
        method: "POST",
        token,
        body: { name: "", node: "mars-1" },
      }),
    );
    expect(invalid.status).toBe(400);
    const invalidBody = (await invalid.json()) as {
      ok: boolean;
      errors: Record<string, string>;
    };
    expect(invalidBody.ok).toBe(false);
    expect(invalidBody.errors.name).toBe("Give the app a name.");
    expect(invalidBody.errors.node).toContain("known nodes");

    const badJson = await appsPost(
      apiRequest("http://localhost/api/v1/apps", {
        method: "POST",
        token,
        rawBody: "not json{",
      }),
    );
    expect(badJson.status).toBe(400);
  });

  it("accepts an admin session instead of a token", async () => {
    await bootstrapToken();
    const response = await appsGet(
      await adminRequest("http://localhost/api/v1/apps"),
    );
    expect(response.status).toBe(200);
  });
});

describe("envs", () => {
  async function setup(): Promise<string> {
    const bootstrap = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "test" },
      }),
    );
    const { data } = (await bootstrap.json()) as { data: { token: string } };
    await appsPost(
      apiRequest("http://localhost/api/v1/apps", {
        method: "POST",
        token: data.token,
        body: { name: "Rota Planner", node: NODE },
      }),
    );
    return data.token;
  }

  it("lists, creates and gets environments", async () => {
    const token = await setup();
    const before = await envsGet(
      apiRequest("http://localhost/api/v1/apps/rota-planner/envs", { token }),
      params({ slug: "rota-planner" }),
    );
    const beforeBody = (await before.json()) as {
      data: { name: string }[];
    };
    expect(beforeBody.data.map((env) => env.name)).toEqual(["sandbox"]);

    const created = await envsPost(
      apiRequest("http://localhost/api/v1/apps/rota-planner/envs", {
        method: "POST",
        token,
        body: { name: "staging", node: NODE },
      }),
      params({ slug: "rota-planner" }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      ok: true,
      data: { name: "staging", node: NODE, status: "pending" },
    });

    const one = await envGet(
      apiRequest("http://localhost/api/v1/apps/rota-planner/envs/staging", {
        token,
      }),
      params({ slug: "rota-planner", env: "staging" }),
    );
    expect(one.status).toBe(200);

    const missingEnv = await envGet(
      apiRequest("http://localhost/api/v1/apps/rota-planner/envs/prod", {
        token,
      }),
      params({ slug: "rota-planner", env: "prod" }),
    );
    expect(missingEnv.status).toBe(404);

    const missingApp = await envsGet(
      apiRequest("http://localhost/api/v1/apps/nope/envs", { token }),
      params({ slug: "nope" }),
    );
    expect(missingApp.status).toBe(404);
  });

  it("401s without credentials and 400s on invalid input", async () => {
    const token = await setup();
    expect(
      (
        await envsGet(
          apiRequest("http://localhost/api/v1/apps/rota-planner/envs"),
          params({ slug: "rota-planner" }),
        )
      ).status,
    ).toBe(401);

    const duplicate = await envsPost(
      apiRequest("http://localhost/api/v1/apps/rota-planner/envs", {
        method: "POST",
        token,
        body: { name: "sandbox", node: NODE },
      }),
      params({ slug: "rota-planner" }),
    );
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toMatchObject({
      ok: false,
      errors: { name: 'The app already has a "sandbox" environment.' },
    });
  });
});

describe("database failures", () => {
  function breakDatabase(reason = "connect ECONNREFUSED 127.0.0.1:5432") {
    mockQuery.mockImplementation(async () => {
      throw new Error(reason);
    });
    mockQueryOne.mockImplementation(async () => {
      throw new Error(reason);
    });
  }

  it("500s the token bootstrap check without leaking internals", async () => {
    breakDatabase();
    const response = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "bootstrap" },
      }),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).not.toContain("ECONNREFUSED");
  });

  it("500s token auth and listing when the database is down", async () => {
    const bootstrap = await tokensPost(
      apiRequest("http://localhost/api/v1/tokens", {
        method: "POST",
        body: { name: "bootstrap" },
      }),
    );
    const { data } = (await bootstrap.json()) as {
      data: { token: string };
    };
    breakDatabase();
    const listed = await tokensGet(
      apiRequest("http://localhost/api/v1/tokens", { token: data.token }),
    );
    expect(listed.status).toBe(500);
  });

  it("500s app reads and writes when the database is down", async () => {
    breakDatabase();
    const listed = await appsGet(
      await adminRequest("http://localhost/api/v1/apps"),
    );
    expect(listed.status).toBe(500);
    const created = await appsPost(
      await adminRequest("http://localhost/api/v1/apps", {
        method: "POST",
        body: { name: "Rota Planner", node: NODE },
      }),
    );
    expect(created.status).toBe(500);
    const body = (await created.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).not.toContain("ECONNREFUSED");
  });
});
