import { probeHost, type ProbeDeps } from "@/lib/dns-probe";

const CERT = {
  subject: "CN=*.qa-lab-01.byov.xexo.io",
  issuer: "CN=Mock CA",
  validFrom: "Oct 27 00:00:00 2026 GMT",
  validTo: "Oct 27 00:00:00 2027 GMT",
};

function deps(overrides: Partial<ProbeDeps> = {}): ProbeDeps {
  return {
    resolve4: async () => ["203.0.113.10"],
    checkTls: async () => ({ authorized: true, cert: CERT }),
    fetchStatus: async () => 404,
    ...overrides,
  };
}

describe("probeHost", () => {
  it("reports all green stages with evidence", async () => {
    const result = await probeHost("byov-probe.qa-lab-01.byov.xexo.io", 443, deps());
    expect(result).toEqual({
      host: "byov-probe.qa-lab-01.byov.xexo.io",
      port: 443,
      dns: { ok: true, addresses: ["203.0.113.10"], error: undefined },
      tls: {
        ok: true,
        authorized: true,
        authorizationError: undefined,
        cert: CERT,
        error: undefined,
      },
      http: { ok: true, status: 404, error: undefined },
    });
  });

  it("skips TLS and HTTP when DNS fails", async () => {
    const result = await probeHost(
      "byov-probe.qa-lab-01.byov.xexo.io",
      443,
      deps({
        resolve4: async () => {
          throw new Error("queryA ENOTFOUND");
        },
      }),
    );
    expect(result.dns.ok).toBe(false);
    expect(result.dns.error).toContain("ENOTFOUND");
    expect(result.tls).toBeNull();
    expect(result.http).toBeNull();
  });

  it("keeps cert evidence when TLS is unauthorized", async () => {
    const result = await probeHost(
      "byov-probe.qa-lab-01.byov.xexo.io",
      443,
      deps({
        checkTls: async () => ({
          authorized: false,
          authorizationError: "SELF_SIGNED_CERT_IN_CHAIN",
          cert: CERT,
        }),
      }),
    );
    expect(result.tls).toMatchObject({
      ok: false,
      authorized: false,
      authorizationError: "SELF_SIGNED_CERT_IN_CHAIN",
      cert: CERT,
    });
    expect(result.http).toBeNull();
  });

  it("reports TLS connection errors", async () => {
    const result = await probeHost(
      "tail-01.yak-bebop.ts.net",
      443,
      deps({
        checkTls: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
    );
    expect(result.tls).toMatchObject({ ok: false });
    expect(result.tls!.error).toContain("ECONNREFUSED");
    expect(result.http).toBeNull();
  });

  it("reports HTTP failures without failing TLS", async () => {
    const result = await probeHost(
      "byov-probe.qa-lab-01.byov.xexo.io",
      443,
      deps({
        fetchStatus: async () => {
          throw new Error("socket hang up");
        },
      }),
    );
    expect(result.tls!.ok).toBe(true);
    expect(result.http!.ok).toBe(false);
    expect(result.http!.error).toContain("hang up");
  });
});
