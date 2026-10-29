import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect } from "vitest";
import {
  getApiTokensFilePath,
  hasAnyTokens,
  hashToken,
  issueToken,
  listTokenInfos,
  mintToken,
  parseTokenId,
  readTokenRecords,
  revokeToken,
  validateTokenName,
  verifyToken,
} from "@/lib/api-tokens";

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.BYOV_DATA_DIR = mkdtempSync(join(tmpdir(), "byov-tokens-test-"));
  delete process.env.AUTH_DATA_DIR;
});

afterEach(() => {
  const dataDir = process.env.BYOV_DATA_DIR;
  if (dataDir && dataDir.startsWith(tmpdir())) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  process.env = { ...savedEnv };
});

describe("mintToken / parseTokenId", () => {
  it("mints unique well-formed tokens", () => {
    const first = mintToken();
    const second = mintToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token.startsWith("byov_")).toBe(true);
    expect(parseTokenId(first.token)).toBe(first.id);
    expect(parseTokenId(second.token)).toBe(second.id);
  });

  it("rejects malformed tokens", () => {
    expect(parseTokenId("")).toBeNull();
    expect(parseTokenId("byov_")).toBeNull();
    expect(parseTokenId("byov_short_secret")).toBeNull();
    expect(parseTokenId("byov_abcdefghijkl")).toBeNull();
    expect(parseTokenId("Bearer byov_abcdefghijkl_secret")).toBeNull();
    expect(parseTokenId("  byov_abcdefghijkl_s3cr3t  ")).toBe("abcdefghijkl");
  });

  it("parses ids when the secret itself contains underscores", () => {
    // Secrets are base64url, so "_" also appears inside them.
    expect(parseTokenId("byov_abcdefghijkl_ab_cd_ef")).toBe("abcdefghijkl");
    expect(parseTokenId("byov_abcdefghijkl__leading")).toBe("abcdefghijkl");
  });
});

describe("validateTokenName", () => {
  it("requires a non-blank name under the limit", () => {
    expect(validateTokenName("cli")).toBeNull();
    expect(validateTokenName("  ")).toBe("Give the token a name.");
    expect(validateTokenName(undefined)).toBe("Give the token a name.");
    expect(validateTokenName("x".repeat(61))).toBe(
      "Keep the name under 60 characters.",
    );
  });
});

describe("issueToken / verifyToken", () => {
  it("issues and verifies a token end to end", async () => {
    expect(hasAnyTokens()).toBe(false);
    const { info, token } = await issueToken("mcp connector");
    expect(info.name).toBe("mcp connector");
    expect(token.startsWith(`byov_${info.id}_`)).toBe(true);
    expect(info.revokedAt).toBeNull();
    expect(hasAnyTokens()).toBe(true);

    const verified = await verifyToken(token);
    expect(verified?.id).toBe(info.id);
    expect(verified?.name).toBe("mcp connector");
  });

  it("stores hashes at rest, never secrets", async () => {
    const { token } = await issueToken("cli");
    const raw = readFileSync(getApiTokensFilePath(), "utf8");
    // The secret is base64url and may itself contain "_" (the delimiter),
    // so the secret is everything after the second "_".
    const secret = token.split("_").slice(2).join("_");
    expect(secret.length).toBeGreaterThan(0);
    expect(raw).not.toContain(token);
    expect(raw).not.toContain(secret);
    expect(raw).toContain(await hashToken(token));
  });

  it("stamps lastUsedAt on successful verification", async () => {
    const { info, token } = await issueToken("cli");
    expect(info.lastUsedAt).toBeNull();
    await verifyToken(token);
    const [record] = readTokenRecords();
    expect(record?.lastUsedAt).not.toBeNull();
  });

  it("rejects unknown, tampered and malformed tokens", async () => {
    const { token, info } = await issueToken("cli");
    expect(await verifyToken("byov_zzzzzzzzzzzz_s3cr3t")).toBeNull();
    // Flip the last char to a guaranteed-different one: "x" may already be
    // the last char of the base64url secret, which would be a no-op tamper.
    const tampered = `${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`;
    expect(tampered).not.toBe(token);
    expect(await verifyToken(tampered)).toBeNull();
    expect(await verifyToken("not-a-token")).toBeNull();
    // The untouched original still verifies.
    expect((await verifyToken(token))?.id).toBe(info.id);
  });

  it("rejects a token with the right id but the wrong secret", async () => {
    const { info } = await issueToken("cli");
    expect(await verifyToken(`byov_${info.id}_wrongsecret`)).toBeNull();
  });
});

describe("revokeToken", () => {
  it("revokes by id and keeps the record listed", async () => {
    const { info, token } = await issueToken("cli");
    expect((await verifyToken(token))?.id).toBe(info.id);

    const revoked = revokeToken(info.id);
    expect(revoked?.id).toBe(info.id);
    expect(revoked?.revokedAt).not.toBeNull();
    expect(await verifyToken(token)).toBeNull();

    const listed = listTokenInfos();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revokedAt).not.toBeNull();
  });

  it("revoking twice is a no-op returning the metadata", async () => {
    const { info } = await issueToken("cli");
    const first = revokeToken(info.id);
    const second = revokeToken(info.id);
    expect(second).toEqual(first);
  });

  it("returns null for unknown ids", () => {
    expect(revokeToken("zzzzzzzzzzzz")).toBeNull();
  });
});

describe("token store robustness", () => {
  it("reads a missing file as empty and skips corrupt entries", async () => {
    expect(readTokenRecords()).toEqual([]);
    const { info } = await issueToken("cli");
    const records = readTokenRecords();
    writeFileSync(
      getApiTokensFilePath(),
      JSON.stringify([...records, { bogus: true }, "nope", null]),
    );
    const reread = readTokenRecords();
    expect(reread.map((record) => record.id)).toEqual([info.id]);
  });

  it("never exposes hashes or secrets through listTokenInfos", async () => {
    await issueToken("cli");
    const listed = listTokenInfos();
    expect(JSON.stringify(listed)).not.toContain("tokenHash");
    for (const info of listed) {
      expect(Object.keys(info).sort()).toEqual(
        ["createdAt", "id", "lastUsedAt", "name", "revokedAt"].sort(),
      );
    }
  });
});
