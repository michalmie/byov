import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";
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

const savedEnv = { ...process.env };
const NODE = "coolify-frankfurt";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
  process.env.BYOV_DATA_DIR = mkdtempSync(join(tmpdir(), "byov-apiv1-test-"));
  delete process.env.AUTH_DATA_DIR;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  const dataDir = process.env.BYOV_DATA_DIR;
  if (dataDir && dataDir.startsWith(tmpdir())) {
    rmSync(dataDir, { recursive: true, force: true });
  }
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
