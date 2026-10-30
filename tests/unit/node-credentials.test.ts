import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/node-credentials";
import { verifyCoolifyConnection, type CoolifyDeps } from "@/lib/coolify-adapter";

describe("node credential encryption", () => {
  it("round-trips and never stores plaintext", () => {
    process.env.AUTH_SECRET = "unit-test-secret";
    const stored = encryptToken("coolify-token-abc123");
    expect(stored).not.toContain("coolify-token-abc123");
    expect(decryptToken(stored)).toBe("coolify-token-abc123");
    expect(decryptToken("garbage")).toBeNull();
    expect(encryptToken("coolify-token-abc123")).not.toBe(stored);
  });
});

describe("verifyCoolifyConnection", () => {
  function deps(status: number): CoolifyDeps {
    return { fetchJson: async () => ({ status, body: [] }) };
  }
  it("accepts 2xx, explains 401, reports other statuses", async () => {
    expect((await verifyCoolifyConnection("https://c.example.com", "t", deps(200))).ok).toBe(true);
    const rejected = await verifyCoolifyConnection("https://c.example.com", "bad", deps(401));
    expect(rejected.ok).toBe(false);
    expect(rejected.detail).toContain("rejected");
    expect(rejected.detail).not.toContain("bad");
    expect((await verifyCoolifyConnection("https://c.example.com", "t", deps(502))).detail).toContain("502");
  });
});
