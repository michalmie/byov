import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { sendMail } from "@/lib/auth-mail";
import {
  DELETE as mailDelete,
  GET as mailGet,
  PUT as mailPut,
} from "@/app/api/settings/mail/route";
import { POST as mailTest } from "@/app/api/settings/mail/test/route";

vi.mock("@/lib/auth-mail", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/auth-mail")>();
  return { ...original, sendMail: vi.fn() };
});

const sendMailMock = vi.mocked(sendMail);
const savedEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  setEnv({
    AUTH_SECRET: "test-secret-for-unit-tests",
    AUTH_DATA_DIR: mkdtempSync(join(tmpdir(), "byov-mail-api-test-")),
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    SMTP_FROM: undefined,
  });
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  const dataDir = process.env.AUTH_DATA_DIR;
  if (dataDir && dataDir.startsWith(tmpdir())) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
});

async function signedRequest(
  url: string,
  init: {
    method?: string;
    role?: "admin" | "member";
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<NextRequest> {
  const headers = new Headers(init.headers);
  if (init.role) {
    const token = await createSession({
      email: `${init.role}@example.com`,
      provider: "passwordless",
      role: init.role,
    });
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  }
  return new NextRequest(url, {
    method: init.method,
    headers,
    body: init.body,
  });
}

const accountBody = {
  host: "smtp.example.com",
  port: 587,
  security: "auto",
  user: "alerts@example.com",
  pass: "s3cret",
  from: "BYOV <alerts@example.com>",
};

describe("GET /api/settings/mail", () => {
  it("401s when signed out and 403s for members", async () => {
    const anon = await mailGet(
      await signedRequest("http://localhost/api/settings/mail", {}),
    );
    expect(anon.status).toBe(401);
    const member = await mailGet(
      await signedRequest("http://localhost/api/settings/mail", {
        role: "member",
      }),
    );
    expect(member.status).toBe(403);
  });

  it("returns the status without secrets for admins", async () => {
    const response = await mailGet(
      await signedRequest("http://localhost/api/settings/mail", {
        role: "admin",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      status: { configured: false, source: "none", hasPassword: false },
    });
    expect(JSON.stringify(body)).not.toContain("pass");
  });
});

describe("PUT /api/settings/mail", () => {
  it("401s when signed out and 403s for members", async () => {
    const anon = await mailPut(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "PUT",
      }),
    );
    expect(anon.status).toBe(401);
    const member = await mailPut(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "PUT",
        role: "member",
      }),
    );
    expect(member.status).toBe(403);
  });

  it("saves the account and reports it back", async () => {
    const response = await mailPut(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "PUT",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accountBody),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      status: {
        configured: true,
        source: "settings",
        host: "smtp.example.com",
        port: 587,
        hasPassword: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("s3cret");
  });

  it("rejects invalid drafts with field errors", async () => {
    const response = await mailPut(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "PUT",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...accountBody, host: "", port: 99999 }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toHaveProperty("host");
    expect(body.errors).toHaveProperty("port");
  });

  it("keeps the saved password when blank", async () => {
    await mailPut(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "PUT",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accountBody),
      }),
    );
    const response = await mailPut(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "PUT",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...accountBody, pass: "", port: 2525 }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toMatchObject({ port: 2525, hasPassword: true });
  });
});

describe("DELETE /api/settings/mail", () => {
  it("clears the saved account back to env", async () => {
    setEnv({ SMTP_HOST: "env.example.com" });
    await mailPut(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "PUT",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accountBody),
      }),
    );
    const cleared = await mailDelete(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "DELETE",
        role: "admin",
      }),
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({
      ok: true,
      status: { configured: true, source: "env", host: "env.example.com" },
    });
    const member = await mailDelete(
      await signedRequest("http://localhost/api/settings/mail", {
        method: "DELETE",
        role: "member",
      }),
    );
    expect(member.status).toBe(403);
  });
});

describe("POST /api/settings/mail/test", () => {
  const testUrl = "http://localhost/api/settings/mail/test";

  it("401s when signed out and 403s for members", async () => {
    const anon = await mailTest(
      await signedRequest(testUrl, { method: "POST" }),
    );
    expect(anon.status).toBe(401);
    const member = await mailTest(
      await signedRequest(testUrl, { method: "POST", role: "member" }),
    );
    expect(member.status).toBe(403);
  });

  it("400s without an account or a valid recipient", async () => {
    const noAccount = await mailTest(
      await signedRequest(testUrl, {
        method: "POST",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "ada@example.com" }),
      }),
    );
    expect(noAccount.status).toBe(400);

    setEnv({ SMTP_HOST: "env.example.com" });
    const badTo = await mailTest(
      await signedRequest(testUrl, {
        method: "POST",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "nope" }),
      }),
    );
    expect(badTo.status).toBe(400);
  });

  it("sends through the active account and reports provider errors", async () => {
    setEnv({ SMTP_HOST: "env.example.com" });
    const ok = await mailTest(
      await signedRequest(testUrl, {
        method: "POST",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "ada@example.com" }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0]?.[0]).toMatchObject({
      to: "ada@example.com",
    });

    sendMailMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const failed = await mailTest(
      await signedRequest(testUrl, {
        method: "POST",
        role: "admin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "ada@example.com" }),
      }),
    );
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({
      ok: false,
      error: "connect ECONNREFUSED",
    });
  });
});
