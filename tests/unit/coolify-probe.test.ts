import {
  MAX_ENDPOINT_LENGTH,
  probeNodeEndpoint,
  type NodeProbeDeps,
} from "@/lib/coolify-probe";

const CERT = {
  subject: "CN=coolify.example.com",
  issuer: "CN=Mock CA",
  validFrom: "Oct 27 00:00:00 2026 GMT",
  validTo: "Oct 27 00:00:00 2027 GMT",
};

function deps(overrides: Partial<NodeProbeDeps> = {}): NodeProbeDeps {
  return {
    resolve4: async () => ["203.0.113.10"],
    checkTls: async () => ({ authorized: true, cert: CERT }),
    fetchStatus: async () => 200,
    ...overrides,
  };
}

describe("probeNodeEndpoint", () => {
  it("reports all green stages with evidence", async () => {
    const result = await probeNodeEndpoint(
      "https://coolify.example.com:8000",
      deps(),
    );
    expect(result).toEqual({
      endpoint: "https://coolify.example.com:8000",
      host: "coolify.example.com",
      port: 8000,
      reachable: true,
      stages: {
        dns: { ok: true, addresses: ["203.0.113.10"], error: undefined },
        tls: {
          ok: true,
          authorized: true,
          error: undefined,
          cert: CERT,
        },
        http: { ok: true, status: 200, error: undefined },
      },
      guidance: "The Coolify endpoint is reachable.",
    });
  });

  it("counts any HTTP status as reachable", async () => {
    const result = await probeNodeEndpoint(
      "https://coolify.example.com",
      deps({ fetchStatus: async () => 404 }),
    );
    expect(result.reachable).toBe(true);
    expect(result.stages.http).toMatchObject({ ok: true, status: 404 });
  });

  it("skips TLS and HTTP when DNS fails", async () => {
    const result = await probeNodeEndpoint(
      "https://coolify.example.com",
      deps({
        resolve4: async () => {
          throw new Error("queryA ENOTFOUND");
        },
      }),
    );
    expect(result.reachable).toBe(false);
    expect(result.stages.dns.ok).toBe(false);
    expect(result.stages.dns.error).toContain("ENOTFOUND");
    expect(result.stages.tls).toBeNull();
    expect(result.stages.http).toBeNull();
    expect(result.guidance).toContain("hostname");
  });

  it("keeps cert evidence when TLS is unauthorized", async () => {
    const result = await probeNodeEndpoint(
      "https://coolify.example.com",
      deps({
        checkTls: async () => ({
          authorized: false,
          authorizationError: "SELF_SIGNED_CERT_IN_CHAIN",
          cert: CERT,
        }),
      }),
    );
    expect(result.reachable).toBe(false);
    expect(result.stages.tls).toMatchObject({
      ok: false,
      authorized: false,
      error: "SELF_SIGNED_CERT_IN_CHAIN",
      cert: CERT,
    });
    expect(result.stages.http).toBeNull();
    expect(result.guidance).toMatch(/certificate|CA/);
  });

  it("reports TLS connection errors", async () => {
    const result = await probeNodeEndpoint(
      "https://coolify.example.com",
      deps({
        checkTls: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
    );
    expect(result.stages.tls).toMatchObject({ ok: false });
    expect(result.stages.tls!.error).toContain("ECONNREFUSED");
    expect(result.stages.http).toBeNull();
    expect(result.guidance).toMatch(/certificate|TLS/);
  });

  it("reports refused HTTP connections with firewall guidance", async () => {
    const result = await probeNodeEndpoint(
      "https://coolify.example.com:8000",
      deps({
        fetchStatus: async () => {
          throw new Error("connect ECONNREFUSED 203.0.113.10:8000");
        },
      }),
    );
    expect(result.stages.tls!.ok).toBe(true);
    expect(result.stages.http!.ok).toBe(false);
    expect(result.stages.http!.error).toContain("ECONNREFUSED");
    expect(result.reachable).toBe(false);
    expect(result.guidance).toMatch(/listening/);
    expect(result.guidance).toMatch(/firewall/);
  });

  it("reports timed-out HTTP connections with firewall guidance", async () => {
    const result = await probeNodeEndpoint(
      "https://coolify.example.com:8000",
      deps({
        fetchStatus: async () => {
          throw new Error("HTTP timed out after 8000ms");
        },
      }),
    );
    expect(result.reachable).toBe(false);
    expect(result.guidance).toMatch(/listening/);
    expect(result.guidance).toMatch(/firewall/);
  });

  it("skips TLS for http endpoints with a plain-HTTP note", async () => {
    const result = await probeNodeEndpoint(
      "http://coolify.example.com:8000",
      deps(),
    );
    expect(result).toMatchObject({
      endpoint: "http://coolify.example.com:8000",
      host: "coolify.example.com",
      port: 8000,
      reachable: true,
    });
    expect(result.stages.tls).toBeNull();
    expect(result.stages.http).toMatchObject({ ok: true, status: 200 });
    expect(result.guidance).toMatch(/plain HTTP/);
  });

  it("still reports HTTP failures for http endpoints", async () => {
    const result = await probeNodeEndpoint(
      "http://coolify.example.com:8000",
      deps({
        fetchStatus: async () => {
          throw new Error("socket hang up");
        },
      }),
    );
    expect(result.stages.tls).toBeNull();
    expect(result.stages.http!.ok).toBe(false);
    expect(result.reachable).toBe(false);
  });

  it("provides guidance on every failure", async () => {
    const failures = [
      deps({
        resolve4: async () => {
          throw new Error("queryA ENOTFOUND");
        },
      }),
      deps({ checkTls: async () => ({ authorized: false }) }),
      deps({
        checkTls: async () => {
          throw new Error("socket hang up");
        },
      }),
      deps({
        fetchStatus: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
    ];
    for (const failure of failures) {
      const result = await probeNodeEndpoint(
        "https://coolify.example.com",
        failure,
      );
      expect(result.reachable).toBe(false);
      expect(typeof result.guidance).toBe("string");
      expect(result.guidance.length).toBeGreaterThan(0);
    }
  });

  it("rejects non-http(s) URLs", async () => {
    for (const endpoint of [
      "ftp://coolify.example.com",
      "ws://coolify.example.com",
      "coolify.example.com",
      "not a url",
      "",
      "   ",
    ]) {
      await expect(probeNodeEndpoint(endpoint, deps())).rejects.toThrow();
    }
  });

  it("rejects overlong input", async () => {
    const endpoint = `https://coolify.example.com/${"a".repeat(MAX_ENDPOINT_LENGTH)}`;
    await expect(probeNodeEndpoint(endpoint, deps())).rejects.toThrow(
      /too long/,
    );
  });
});
