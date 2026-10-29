import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
  clearStoredMailAccount,
  DEFAULT_SMTP_PORT,
  getEffectiveMailAccount,
  getMailAccountStatus,
  getStoredMailAccount,
  saveStoredMailAccount,
  validateMailAccount,
} from "@/lib/mail-config";

// In-memory fake for the single-row `mail_account` table.
vi.mock("@/lib/db", () => {
  let row: Record<string, unknown> | null = null;

  function norm(text: string): string {
    return text.replace(/\s+/g, " ").trim().toUpperCase();
  }

  async function query(
    text: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown>[]> {
    const sql = norm(text);
    if (sql.startsWith("INSERT INTO MAIL_ACCOUNT")) {
      const [host, port, security, username, pass, from_address] = params;
      row = { host, port, security, username, pass, from_address };
      return [];
    }
    if (sql.startsWith("DELETE FROM MAIL_ACCOUNT")) {
      row = null;
      return [];
    }
    if (sql.startsWith("SELECT HOST, PORT, SECURITY")) {
      return row ? [{ ...row }] : [];
    }
    throw new Error(`fake db: unexpected SQL: ${text}`);
  }

  async function queryOne(
    text: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown> | null> {
    const rows = await query(text, params);
    return rows[0] ?? null;
  }

  return {
    query,
    queryOne,
    registerMigration: () => {},
    __resetFakeDb: () => {
      row = null;
    },
    __seedMailRow: (value: Record<string, unknown> | null) => {
      row = value;
    },
  };
});

interface FakeDbControls {
  __resetFakeDb: () => void;
  __seedMailRow: (value: Record<string, unknown> | null) => void;
}

async function fakeDb(): Promise<FakeDbControls> {
  return (await import("@/lib/db")) as unknown as FakeDbControls;
}

const savedEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearMailEnv() {
  setEnv({
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    SMTP_FROM: undefined,
  });
}

beforeEach(async () => {
  clearMailEnv();
  (await fakeDb()).__resetFakeDb();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
});

const validDraft = {
  host: "smtp.example.com",
  port: 587,
  security: "auto",
  user: "alerts@example.com",
  pass: "s3cret",
  from: "BYOV <alerts@example.com>",
};

describe("validateMailAccount", () => {
  it("accepts a complete draft", () => {
    expect(validateMailAccount(validDraft)).toEqual({});
  });

  it("accepts an empty password (no SMTP auth) and empty from", () => {
    expect(
      validateMailAccount({ ...validDraft, pass: "", from: "" }),
    ).toEqual({});
  });

  it("rejects a missing or malformed host", () => {
    expect(validateMailAccount({ ...validDraft, host: "  " })).toHaveProperty(
      "host",
    );
    expect(
      validateMailAccount({ ...validDraft, host: "smtp://x.example/y" }),
    ).toHaveProperty("host");
  });

  it("rejects out-of-range ports", () => {
    for (const port of [0, -1, 65536, 1.5, Number.NaN]) {
      expect(validateMailAccount({ ...validDraft, port })).toHaveProperty(
        "port",
      );
    }
    expect(validateMailAccount({ ...validDraft, port: 465 })).toEqual({});
  });

  it("rejects unknown security modes and bad from addresses", () => {
    expect(
      validateMailAccount({ ...validDraft, security: "rot13" }),
    ).toHaveProperty("security");
    expect(validateMailAccount({ ...validDraft, from: "not-an-email" })).toHaveProperty(
      "from",
    );
  });
});

describe("stored account", () => {
  it("round-trips through the database and clears", async () => {
    expect(await getStoredMailAccount()).toBeNull();
    await saveStoredMailAccount({
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      user: "alerts@example.com",
      pass: "s3cret",
      from: "BYOV <alerts@example.com>",
    });
    expect(await getStoredMailAccount()).toEqual({
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      user: "alerts@example.com",
      pass: "s3cret",
      from: "BYOV <alerts@example.com>",
    });
    await clearStoredMailAccount();
    expect(await getStoredMailAccount()).toBeNull();
  });

  it("ignores malformed rows", async () => {
    (await fakeDb()).__seedMailRow({ host: 42 });
    expect(await getStoredMailAccount()).toBeNull();
    (await fakeDb()).__seedMailRow({
      host: "smtp.example.com",
      port: 587,
      security: "rot13",
      username: "",
      pass: "",
      from_address: "",
    });
    expect(await getStoredMailAccount()).toBeNull();
  });
});

describe("effective account", () => {
  it("prefers the Settings-saved account over env", async () => {
    setEnv({
      SMTP_HOST: "env.example.com",
      SMTP_PORT: "2525",
      SMTP_USER: "env-user",
      SMTP_PASS: "env-pass",
      SMTP_FROM: "env@example.com",
    });
    await saveStoredMailAccount({
      host: "smtp.example.com",
      port: 587,
      security: "auto",
      user: "alerts@example.com",
      pass: "s3cret",
      from: "",
    });
    expect(await getEffectiveMailAccount()).toMatchObject({
      host: "smtp.example.com",
      port: 587,
      source: "settings",
    });
    await clearStoredMailAccount();
    expect(await getEffectiveMailAccount()).toMatchObject({
      host: "env.example.com",
      port: 2525,
      user: "env-user",
      source: "env",
    });
  });

  it("falls back to port 587 and the default from on bad env", async () => {
    setEnv({ SMTP_HOST: "env.example.com", SMTP_PORT: "bogus" });
    expect(await getEffectiveMailAccount()).toMatchObject({
      host: "env.example.com",
      port: DEFAULT_SMTP_PORT,
      from: "BYOV <no-reply@byov.local>",
    });
  });

  it("is null when nothing is configured", async () => {
    expect(await getEffectiveMailAccount()).toBeNull();
    expect(await getMailAccountStatus()).toMatchObject({
      configured: false,
      source: "none",
      hasPassword: false,
    });
  });

  it("status never carries the password", async () => {
    setEnv({ SMTP_HOST: "env.example.com", SMTP_PASS: "env-pass" });
    const status = await getMailAccountStatus();
    expect(status).toMatchObject({
      configured: true,
      source: "env",
      hasPassword: true,
    });
    expect(JSON.stringify(status)).not.toContain("env-pass");
  });
});
