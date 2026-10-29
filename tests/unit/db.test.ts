import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDatabaseUrl,
  getMigrations,
  migrate,
  query,
  registerMigration,
  type Migration,
  type Queryable,
} from "@/lib/db";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

/** In-memory fake satisfying `Queryable`, recording every statement. */
function fakeClient(seedRecorded: string[] = []): Queryable & {
  statements: string[];
  recorded: Set<string>;
} {
  const statements: string[] = [];
  const recorded = new Set(seedRecorded);
  return {
    statements,
    recorded,
    query: async (text: string, params?: unknown[]) => {
      statements.push(text);
      const normalized = text.trim().toUpperCase();
      if (normalized.startsWith("SELECT NAME FROM SCHEMA_MIGRATIONS")) {
        return { rows: [...recorded].map((name) => ({ name })) };
      }
      if (normalized.startsWith("INSERT INTO SCHEMA_MIGRATIONS")) {
        recorded.add(String(params?.[0]));
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

describe("getDatabaseUrl", () => {
  it("fails fast when DATABASE_URL is missing or blank", () => {
    delete process.env.DATABASE_URL;
    expect(() => getDatabaseUrl()).toThrow(/DATABASE_URL is not set/);
    process.env.DATABASE_URL = "   ";
    expect(() => getDatabaseUrl()).toThrow(/DATABASE_URL is not set/);
  });

  it("rejects non-postgres URLs", () => {
    process.env.DATABASE_URL = "file:/tmp/preview.sqlite";
    expect(() => getDatabaseUrl()).toThrow(/must be a postgres/);
    process.env.DATABASE_URL = "mysql://root@localhost/byov";
    expect(() => getDatabaseUrl()).toThrow(/must be a postgres/);
  });

  it("accepts postgres URLs, trimmed", () => {
    process.env.DATABASE_URL = "  postgres://byov:byov@localhost:5432/byov  ";
    expect(getDatabaseUrl()).toBe("postgres://byov:byov@localhost:5432/byov");
    process.env.DATABASE_URL = "postgresql:///byov?host=/var/run/postgresql";
    expect(getDatabaseUrl()).toBe(
      "postgresql:///byov?host=/var/run/postgresql",
    );
  });
});

describe("migration registry", () => {
  it("registers once and lists sorted by name", () => {
    registerMigration("9999_zulu", "SELECT 1");
    registerMigration("9999_alpha", "SELECT 2");
    registerMigration("9999_zulu", "SELECT 999"); // first wins
    const names = getMigrations()
      .filter((migration) => migration.name.startsWith("9999_"))
      .map((migration) => migration.name);
    expect(names).toEqual(["9999_alpha", "9999_zulu"]);
    const zulu = getMigrations().find(
      (migration) => migration.name === "9999_zulu",
    );
    expect(zulu?.sql).toBe("SELECT 1");
  });
});

describe("migrate", () => {
  const migrations: Migration[] = [
    { name: "0002_second", sql: "CREATE TABLE second (id INT)" },
    { name: "0001_first", sql: "CREATE TABLE first (id INT)" },
  ];

  it("applies pending migrations in name order inside transactions", async () => {
    const client = fakeClient();
    const applied = await migrate(client, migrations);
    expect(applied).toEqual(["0001_first", "0002_second"]);
    expect(client.recorded).toEqual(
      new Set(["0001_first", "0002_second"]),
    );
    const joined = client.statements.join("\n");
    expect(joined.indexOf("CREATE TABLE first")).toBeLessThan(
      joined.indexOf("CREATE TABLE second"),
    );
    // One BEGIN/COMMIT pair per migration (plus the bootstrap DDL).
    expect(
      client.statements.filter((statement) => statement === "BEGIN"),
    ).toHaveLength(2);
    expect(
      client.statements.filter((statement) => statement === "COMMIT"),
    ).toHaveLength(2);
  });

  it("skips recorded migrations and is idempotent", async () => {
    const client = fakeClient(["0001_first", "0002_second"]);
    await expect(migrate(client, migrations)).resolves.toEqual([]);
    expect(
      client.statements.some(
        (statement) =>
          statement.includes("CREATE TABLE first") ||
          statement.includes("CREATE TABLE second"),
      ),
    ).toBe(false);
  });

  it("rolls back a failing migration and leaves it unrecorded", async () => {
    const client = fakeClient();
    const failing: Migration[] = [
      { name: "0001_ok", sql: "CREATE TABLE ok (id INT)" },
      { name: "0002_bad", sql: "BOGUS SYNTAX HERE" },
    ];
    const realQuery = client.query;
    client.query = async (text: string, params?: unknown[]) => {
      if (text.includes("BOGUS")) {
        throw new Error("syntax error");
      }
      return realQuery(text, params);
    };
    await expect(migrate(client, failing)).rejects.toThrow(/syntax error/);
    expect(client.recorded).toEqual(new Set(["0001_ok"]));
    expect(client.statements).toContain("ROLLBACK");
  });
});

describe("query", () => {
  it("fails fast without DATABASE_URL instead of connecting", async () => {
    delete process.env.DATABASE_URL;
    await expect(query("SELECT 1")).rejects.toThrow(
      /DATABASE_URL is not set/,
    );
  });
});
