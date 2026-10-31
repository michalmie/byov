import { describe, expect, it, vi } from "vitest";
import {
  coolifyGithubAppFor,
  coolifyStatusToHealth,
  coolifyTokenFor,
  createApplication,
  deployApplication,
  ensureCoolifyTarget,
  getApplication,
  getApplicationLogs,
  resolveGithubAppUuid,
  setApplicationEnvVars,
  updateApplicationFqdn,
  type CoolifyDeps,
} from "@/lib/coolify-adapter";

function fakeDeps(
  handler: (
    url: string,
    init: { method: string; body?: unknown },
  ) => { status: number; body: unknown },
) {
  const calls: Array<{ url: string; method: string; body?: unknown; token: string }> = [];
  const deps: CoolifyDeps = {
    fetchJson: vi.fn(async (url, init) => {
      calls.push({ url, method: init.method, body: init.body, token: init.token });
      return handler(url, init);
    }),
  };
  return { deps, calls };
}

const TARGET = {
  serverUuid: "srv-1",
  projectUuid: "prj-1",
  environmentName: "sandbox",
  environmentUuid: "env-1",
};

describe("coolify adapter", () => {
  it("creates a public application through the typed endpoint", async () => {
    const { deps, calls } = fakeDeps(() => ({ status: 201, body: { uuid: "app-123" } }));
    const ref = await createApplication(
      "https://coolify.example.com/",
      "tok",
      {
        name: "rota-sandbox",
        domains: "https://rota-sandbox.example.com",
        gitRepository: "https://github.com/example/rota.git",
        gitBranch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        target: TARGET,
      },
      deps,
    );
    expect(ref.uuid).toBe("app-123");
    expect(calls[0]?.url).toBe("https://coolify.example.com/api/v1/applications/public");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.token).toBe("tok");
    expect(calls[0]?.body).toMatchObject({
      name: "rota-sandbox",
      project_uuid: "prj-1",
      server_uuid: "srv-1",
      environment_name: "sandbox",
      git_repository: "https://github.com/example/rota.git",
      git_branch: "main",
      build_pack: "nixpacks",
      ports_exposes: "3000",
      domains: "https://rota-sandbox.example.com",
      is_auto_deploy_enabled: false,
    });
  });

  it("creates private GitHub apps through the github-app endpoint", async () => {
    const { deps, calls } = fakeDeps(() => ({ status: 201, body: { uuid: "app-9" } }));
    await createApplication(
      "https://c.example.com",
      "tok",
      {
        name: "rota-sandbox",
        domains: null,
        gitRepository: "https://github.com/example/rota.git",
        gitBranch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        target: TARGET,
        githubAppUuid: "gh-1",
      },
      deps,
    );
    expect(calls[0]?.url).toBe(
      "https://c.example.com/api/v1/applications/private-github-app",
    );
    expect(calls[0]?.body).toMatchObject({
      github_app_uuid: "gh-1",
      git_repository: "example/rota",
    });
  });

  it("refuses to create without a git repository", async () => {
    const { deps, calls } = fakeDeps(() => ({ status: 201, body: { uuid: "x" } }));
    await expect(
      createApplication("https://c.example.com", "tok", {
        name: "x",
        domains: null,
        gitRepository: "",
        gitBranch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        target: TARGET,
      }, deps),
    ).rejects.toThrow("repository");
    expect(calls).toHaveLength(0);
  });

  it("surfaces the provider message on failure", async () => {
    const { deps } = fakeDeps(() => ({ status: 404, body: { message: "Not found." } }));
    await expect(
      createApplication("https://c.example.com", "bad", {
        name: "x",
        domains: null,
        gitRepository: "https://github.com/e/r.git",
        gitBranch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        target: TARGET,
      }, deps),
    ).rejects.toThrow("HTTP 404");
    await expect(
      createApplication("https://c.example.com", "bad", {
        name: "x",
        domains: null,
        gitRepository: "https://github.com/e/r.git",
        gitBranch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        target: TARGET,
      }, deps),
    ).rejects.toThrow("Not found");
  });

  it("updates domains, env vars in bulk, and deploys via /deploy", async () => {
    const { deps, calls } = fakeDeps((url) => {
      if (url.endsWith("/logs")) return { status: 200, body: "hello logs" };
      if (url.includes("/api/v1/deploy?")) {
        return { status: 200, body: { deployments: [{ deployment_uuid: "dep-9" }] } };
      }
      if (url.includes("/applications/app-1")) {
        return { status: 200, body: { uuid: "app-1", fqdn: "https://x.example.com", status: "running:healthy" } };
      }
      return { status: 200, body: {} };
    });
    await updateApplicationFqdn("https://c.example.com", "tok", "app-1", "https://x.example.com", deps);
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.body).toEqual({ domains: "https://x.example.com" });

    await setApplicationEnvVars("https://c.example.com", "tok", "app-1", { A: "1" }, deps);
    const envCall = calls.find((c) => c.url.endsWith("/envs/bulk"));
    expect(envCall?.method).toBe("PATCH");
    expect(envCall?.body).toEqual({ data: [{ key: "A", value: "1" }] });

    const deployed = await deployApplication("https://c.example.com", "tok", "app-1", deps);
    expect(deployed.deploymentId).toBe("dep-9");

    expect((await getApplication("https://c.example.com", "tok", "app-1", deps)).status).toBe("running:healthy");
    expect(await getApplicationLogs("https://c.example.com", "tok", "app-1", deps)).toBe("hello logs");
  });

  it("provisions the BYOV project target from a single usable server", async () => {
    const { deps, calls } = fakeDeps((url, init) => {
      if (url.endsWith("/api/v1/servers")) {
        return { status: 200, body: [{ uuid: "srv-1", is_usable: true, is_reachable: true }] };
      }
      if (url.endsWith("/api/v1/projects")) {
        return init.method === "GET"
          ? { status: 200, body: [] }
          : { status: 201, body: { uuid: "prj-1" } };
      }
      if (url.endsWith("/environments")) {
        return init.method === "GET"
          ? { status: 200, body: [] }
          : { status: 201, body: { uuid: "env-1" } };
      }
      return { status: 200, body: {} };
    });
    const target = await ensureCoolifyTarget("https://c.example.com", "tok", "sandbox", deps);
    expect(target).toEqual({
      serverUuid: "srv-1",
      projectUuid: "prj-1",
      environmentName: "sandbox",
      environmentUuid: "env-1",
    });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/v1/projects"))).toBe(true);
  });

  it("reuses an existing BYOV project and environment", async () => {
    const { deps, calls } = fakeDeps((url) => {
      if (url.endsWith("/api/v1/servers")) {
        return { status: 200, body: [{ uuid: "srv-1", is_usable: true, is_reachable: true }] };
      }
      if (url.endsWith("/api/v1/projects")) {
        return { status: 200, body: [{ uuid: "prj-9", name: "BYOV" }] };
      }
      if (url.endsWith("/environments")) {
        return { status: 200, body: [{ uuid: "env-9", name: "sandbox" }] };
      }
      return { status: 200, body: {} };
    });
    const target = await ensureCoolifyTarget("https://c.example.com", "tok", "sandbox", deps);
    expect(target.projectUuid).toBe("prj-9");
    expect(target.environmentUuid).toBe("env-9");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("fails clearly when no usable server exists", async () => {
    const { deps } = fakeDeps((url) => {
      if (url.endsWith("/api/v1/servers")) return { status: 200, body: [] };
      return { status: 200, body: {} };
    });
    await expect(ensureCoolifyTarget("https://c.example.com", "tok", "sandbox", deps)).rejects.toThrow(
      "usable server",
    );
  });

  it("resolves the GitHub App explicitly or from a single private app", async () => {
    const { deps } = fakeDeps((url) => {
      if (url.endsWith("/api/v1/github-apps")) {
        return {
          status: 200,
          body: [
            { uuid: "pub", is_public: true },
            { uuid: "priv-1", is_public: false },
          ],
        };
      }
      return { status: 200, body: {} };
    });
    expect(await resolveGithubAppUuid("https://c.example.com", "tok", "explicit", deps)).toBe("explicit");
    expect(await resolveGithubAppUuid("https://c.example.com", "tok", null, deps)).toBe("priv-1");
  });

  it("returns no GitHub App when several private apps exist", async () => {
    const { deps } = fakeDeps((url) => {
      if (url.endsWith("/api/v1/github-apps")) {
        return {
          status: 200,
          body: [
            { uuid: "a", is_public: false },
            { uuid: "b", is_public: false },
          ],
        };
      }
      return { status: 200, body: {} };
    });
    expect(await resolveGithubAppUuid("https://c.example.com", "tok", null, deps)).toBeNull();
  });

  it("maps provider statuses onto BYOV health", () => {
    expect(coolifyStatusToHealth("running:healthy")).toBe("healthy");
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

  it("reads the per-node GitHub App uuid from the environment", () => {
    const prev = { ...process.env };
    process.env.COOLIFY_GITHUB_APP_CONTABO = "gh-live";
    expect(coolifyGithubAppFor("contabo")).toBe("gh-live");
    expect(coolifyGithubAppFor("other-node")).toBe("");
    process.env = prev;
  });
});
