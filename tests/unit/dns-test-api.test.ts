import { beforeEach, expect, vi } from "vitest";
import { POST } from "@/app/api/dns-test/route";
import { probeHost } from "@/lib/dns-probe";

vi.mock("@/lib/dns-probe", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/dns-probe")>();
  return { ...original, probeHost: vi.fn() };
});

const probeMock = vi.mocked(probeHost);

function request(body: unknown): Request {
  return new Request("http://localhost/api/dns-test", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/dns-test", () => {
  beforeEach(() => {
    probeMock.mockReset();
    probeMock.mockResolvedValue({
      host: "byov-probe.qa-lab-01.byov.xexo.io",
      port: 443,
      dns: { ok: true, addresses: ["203.0.113.10"] },
      tls: null,
      http: null,
    });
  });

  it("probes a valid hostname on the default port", async () => {
    const response = await POST(
      request({ host: "  BYOV-PROBE.qa-lab-01.byov.xexo.io " }),
    );
    expect(response.status).toBe(200);
    expect(probeMock).toHaveBeenCalledWith(
      "byov-probe.qa-lab-01.byov.xexo.io",
      443,
    );
    expect(await response.json()).toMatchObject({
      host: "byov-probe.qa-lab-01.byov.xexo.io",
    });
  });

  it("accepts an explicit tailnet-range port", async () => {
    const response = await POST(
      request({ host: "tail-01.yak-bebop.ts.net", port: 12345 }),
    );
    expect(response.status).toBe(200);
    expect(probeMock).toHaveBeenCalledWith("tail-01.yak-bebop.ts.net", 12345);
  });

  it("rejects malformed hostnames", async () => {
    for (const host of ["", "localhost", "*.example.com", "no dots", 443, null]) {
      const response = await POST(request({ host }));
      expect(response.status).toBe(400);
    }
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("rejects disallowed ports", async () => {
    for (const port of [80, 22, 9999, 20000, "443", null]) {
      const response = await POST(
        request({ host: "tail-01.yak-bebop.ts.net", port }),
      );
      expect(response.status).toBe(400);
    }
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body", async () => {
    const response = await POST(request("not json{"));
    expect(response.status).toBe(400);
    expect(probeMock).not.toHaveBeenCalled();
  });
});
