import { beforeEach, describe, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  migrate: vi.fn(),
  registerMigration: vi.fn(),
  getMigrations: vi.fn(() => []),
  getDatabaseUrl: vi.fn(() => "postgres://localhost/test"),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

import { query, queryOne } from "@/lib/db";
import {
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

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);

interface FakeTokenRow {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** In-memory `api_tokens` table backing the mocked `query`/`queryOne`. */
const tokens = new Map<string, FakeTokenRow>();

/** Mirror `pg`: TIMESTAMPTZ columns arrive as Dates. */
function toPgRow(row: FakeTokenRow) {
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.tokenHash,
    createdAt: new Date(row.createdAt),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
  };
}

function uniqueViolation(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "api_tokens_pkey"',
    ),
    { code: "23505" },
  );
}

async function fakeQuery(
  text: string,
  params: unknown[],
): Promise<unknown[]> {
  if (text.includes("FROM api_tokens")) {
    if (text.startsWith("SELECT 1")) {
      return tokens.size > 0 ? [{ one: 1 }] : [];
    }
    if (text.includes("WHERE id = $1")) {
      const row = tokens.get(String(params[0]));
      return row ? [toPgRow(row)] : [];
    }
    return [...tokens.values()]
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .map(toPgRow);
  }
  if (text.startsWith("INSERT INTO api_tokens")) {
    const [id, name, tokenHash, createdAt] = params as [
      string,
      string,
      string,
      string,
    ];
    if (tokens.has(id)) {
      throw uniqueViolation();
    }
    tokens.set(id, {
      id,
      name,
      tokenHash,
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    });
    return [];
  }
  if (text.startsWith("UPDATE api_tokens SET last_used_at")) {
    const [lastUsedAt, id] = params as [string, string];
    const row = tokens.get(id);
    if (row) {
      row.lastUsedAt = lastUsedAt;
    }
    return [];
  }
  if (text.startsWith("UPDATE api_tokens SET revoked_at")) {
    const [revokedAt, id] = params as [string, string];
    const row = tokens.get(id);
    if (row) {
      row.revokedAt = revokedAt;
    }
    return [];
  }
  throw new Error(`unexpected SQL in fake: ${text}`);
}

beforeEach(() => {
  tokens.clear();
  mockQuery.mockReset();
  mockQueryOne.mockReset();
  mockQuery.mockImplementation(async (text: string, params?: unknown[]) => {
    return fakeQuery(text, params ?? []);
  });
  mockQueryOne.mockImplementation(async (text: string, params?: unknown[]) => {
    const rows = await fakeQuery(text, params ?? []);
    return rows.length > 0 ? rows[0] : null;
  });
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
    expect(parseTokenId("Bearer [REDACTED]")).toBeNull();
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
    expect(await hasAnyTokens()).toBe(false);
    const { info, token } = await issueToken("mcp connector");
    expect(info.name).toBe("mcp connector");
    expect(token.startsWith(`byov_${info.id}_`)).toBe(true);
    expect(info.revokedAt).toBeNull();
    expect(await hasAnyTokens()).toBe(true);

    const verified = await verifyToken(token);
    expect(verified?.id).toBe(info.id);
    expect(verified?.name).toBe("mcp connector");
  });

  it("stores hashes at rest, never secrets", async () => {
    const { token } = await issueToken("cli");
    const insert = mockQuery.mock.calls.find(([text]) =>
      text.startsWith("INSERT INTO api_tokens"),
    );
    expect(insert).toBeDefined();
    const params = insert?.[1] as unknown[];
    // The secret is base64url and may itself contain "_" (the delimiter),
    // so the secret is everything after the second "_".
    const secret = token.split("_").slice(2).join("_");
    expect(secret.length).toBeGreaterThan(0);
    expect(JSON.stringify(params)).not.toContain(token);
    expect(JSON.stringify(params)).not.toContain(secret);
    expect(params).toContain(await hashToken(token));
  });

  it("stamps lastUsedAt on successful verification", async () => {
    const { info, token } = await issueToken("cli");
    expect(info.lastUsedAt).toBeNull();
    await verifyToken(token);
    const [record] = await readTokenRecords();
    expect(record?.lastUsedAt).not.toBeNull();
  });

  it("a failed use-stamp does not fail verification", async () => {
    const { info, token } = await issueToken("cli");
    mockQuery.mockImplementationOnce(async () => {
      throw new Error("connection reset");
    });
    const verified = await verifyToken(token);
    expect(verified?.id).toBe(info.id);
  });

  it("retries issuance when a minted id collides", async () => {
    mockQuery.mockImplementationOnce(async () => {
      throw uniqueViolation();
    });
    const { info, token } = await issueToken("cli");
    expect((await verifyToken(token))?.id).toBe(info.id);
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

  it("propagates database failures to the caller", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db is down"));
    await expect(issueToken("cli")).rejects.toThrow("db is down");
  });
});

describe("revokeToken", () => {
  it("revokes by id and keeps the record listed", async () => {
    const { info, token } = await issueToken("cli");
    expect((await verifyToken(token))?.id).toBe(info.id);

    const revoked = await revokeToken(info.id);
    expect(revoked?.id).toBe(info.id);
    expect(revoked?.revokedAt).not.toBeNull();
    expect(await verifyToken(token)).toBeNull();

    const listed = await listTokenInfos();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revokedAt).not.toBeNull();
  });

  it("revoking twice is a no-op returning the metadata", async () => {
    const { info } = await issueToken("cli");
    const first = await revokeToken(info.id);
    const second = await revokeToken(info.id);
    expect(second).toEqual(first);
  });

  it("returns null for unknown ids", async () => {
    expect(await revokeToken("zzzzzzzzzzzz")).toBeNull();
  });
});

describe("token store robustness", () => {
  it("reads an empty store as empty", async () => {
    expect(await readTokenRecords()).toEqual([]);
    expect(await listTokenInfos()).toEqual([]);
  });

  it("never exposes hashes or secrets through listTokenInfos", async () => {
    await issueToken("cli");
    const listed = await listTokenInfos();
    expect(JSON.stringify(listed)).not.toContain("tokenHash");
    for (const info of listed) {
      expect(Object.keys(info).sort()).toEqual(
        ["createdAt", "id", "lastUsedAt", "name", "revokedAt", "scopes"].sort(),
      );
    }
  });
});
