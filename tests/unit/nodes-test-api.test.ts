import { beforeEach, expect, vi } from "vitest";
import { POST } from "@/app/api/nodes-test/route";
import { probeNodeEndpoint } from "@/lib/coolify-probe";

vi.mock("@/lib/coolify-probe", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/coolify-probe")>();
  return { ...original, probeNodeEndpoint: vi.fn() };
});

const probeMock = vi.mocked(probeNodeEndpoint);

function request(body: unknown): Request {
  return new Request("http://localhost/api/nodes-test", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/nodes-test", () => {
  beforeEach(() => {
    probeMock.mockReset();
    probeMock.mockResolvedValue({
      endpoint: "https://coolify.example.com:8000",
      host: "coolify.example.com",
      port: 8000,
      reachable: true,
      stages: {
        dns: { ok: true, addresses: ["203.0.113.10"] },
        tls: { ok: true, authorized: true },
        http: { ok: true, status: 200 },
      },
      guidance: "The Coolify endpoint is reachable.",
    });
  });

  it("probes a valid endpoint and returns the probe shape", async () => {
    const response = await POST(
      request({ endpoint: "  https://coolify.example.com:8000 " }),
    );
    expect(response.status).toBe(200);
    expect(probeMock).toHaveBeenCalledWith("https://coolify.example.com:8000");
    expect(await response.json()).toMatchObject({
      endpoint: "https://coolify.example.com:8000",
      host: "coolify.example.com",
      port: 8000,
      reachable: true,
      stages: {
        dns: { ok: true, addresses: ["203.0.113.10"] },
        tls: { ok: true, authorized: true },
        http: { ok: true, status: 200 },
      },
      guidance: expect.any(String),
    });
  });

  it("accepts an http endpoint without an explicit port", async () => {
    probeMock.mockResolvedValue({
      endpoint: "http://coolify.example.com",
      host: "coolify.example.com",
      port: 80,
      reachable: true,
      stages: {
        dns: { ok: true, addresses: ["203.0.113.10"] },
        tls: null,
        http: { ok: true, status: 200 },
      },
      guidance: "The endpoint is reachable over plain HTTP.",
    });
    const response = await POST(
      request({ endpoint: "http://coolify.example.com" }),
    );
    expect(response.status).toBe(200);
    expect(probeMock).toHaveBeenCalledWith("http://coolify.example.com");
  });

  it("rejects malformed endpoints", async () => {
    for (const endpoint of [
      "",
      "   ",
      "coolify.example.com",
      "ftp://coolify.example.com",
      `https://coolify.example.com/${"a".repeat(3000)}`,
      443,
      null,
    ]) {
      const response = await POST(request({ endpoint }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: expect.any(String),
      });
    }
  });

  it("rejects malformed endpoints without probing", async () => {
    for (const endpoint of ["ftp://coolify.example.com", 443, null]) {
      probeMock.mockClear();
      const response = await POST(request({ endpoint }));
      expect(response.status).toBe(400);
      expect(probeMock).not.toHaveBeenCalled();
    }
  });

  it("rejects a non-JSON body", async () => {
    const response = await POST(request("not json{"));
    expect(response.status).toBe(400);
    expect(probeMock).not.toHaveBeenCalled();
  });
});
