import { describe, expect, it, vi } from "vitest";
import {
  coolifyStatusToHealth,
  coolifyTokenFor,
  createApplication,
  deployApplication,
  getApplication,
  getApplicationLogs,
  updateApplicationFqdn,
  type CoolifyDeps,
} from "@/lib/coolify-adapter";

function fakeDeps(handler: (url: string, init: { method: string; body?: unknown }) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; method: string; body?: unknown; token: string }> = [];
  const deps: CoolifyDeps = {
    fetchJson: vi.fn(async (url, init) => {
      calls.push({ url, method: init.method, body: init.body, token: init.token });
      return handler(url, init);
    }),
  };
  return { deps, calls };
}

describe("coolify adapter", () => {
  it("creates an application and returns its uuid", async () => {
    const { deps, calls } = fakeDeps(() => ({ status: 201, body: { uuid: "app-123" } }));
    const ref = await createApplication("https://coolify.example.com/", "tok", { name: "rota-sandbox", fqdn: "https://rota-sandbox.example.com" }, deps);
    expect(ref.uuid).toBe("app-123");
    expect(calls[0]?.url).toBe("https://coolify.example.com/api/v1/applications");
    expect(calls[0]?.token).toBe("tok");
  });

  it("updates FQDN, deploys, reads status and logs", async () => {
    const { deps } = fakeDeps((url) => {
      if (url.endsWith("/logs")) return { status: 200, body: "hello logs" };
      if (url.endsWith("/deploy")) return { status: 200, body: { deployment_id: "dep-9" } };
      if (url.includes("/applications/app-1")) return { status: 200, body: { uuid: "app-1", fqdn: "https://x.example.com", status: "running" } };
      return { status: 200, body: {} };
    });
    await updateApplicationFqdn("https://c.example.com", "tok", "app-1", "https://x.example.com", deps);
    expect((await deployApplication("https://c.example.com", "tok", "app-1", deps)).deploymentId).toBe("dep-9");
    expect((await getApplication("https://c.example.com", "tok", "app-1", deps)).status).toBe("running");
    expect(await getApplicationLogs("https://c.example.com", "tok", "app-1", deps)).toBe("hello logs");
  });

  it("throws a CoolifyError on provider failure", async () => {
    const { deps } = fakeDeps(() => ({ status: 401, body: { message: "nope" } }));
    await expect(createApplication("https://c.example.com", "bad", { name: "x", fqdn: null }, deps)).rejects.toThrow("HTTP 401");
  });

  it("maps provider statuses onto BYOV health", () => {
    expect(coolifyStatusToHealth("running")).toBe("healthy");
    expect(coolifyStatusToHealth("deploying")).toBe("deploying");
    expect(coolifyStatusToHealth("exited")).toBe("down");
    expect(coolifyStatusToHealth(undefined)).toBe("pending");
  });

  it("prefers the per-node token over the shared token", () => {
    const prev = { ...process.env };
    process.env.COOLIFY_API_TOKEN = "shared";
    process.env.COOLIFY_TOKEN_COOLIFY_FRANKFURT = "per-node";
    expect(coolifyTokenFor("coolify-frankfurt")).toBe("per-node");
    expect(coolifyTokenFor("other-node")).toBe("shared");
    process.env = prev;
  });
});
