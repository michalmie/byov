import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
  clearStoredMailAccount,
  DEFAULT_SMTP_PORT,
  getEffectiveMailAccount,
  getMailAccountStatus,
  getMailConfigFilePath,
  getStoredMailAccount,
  saveStoredMailAccount,
  validateMailAccount,
} from "@/lib/mail-config";

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
    AUTH_DATA_DIR: mkdtempSync(join(tmpdir(), "byov-mail-test-")),
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    SMTP_FROM: undefined,
  });
}

beforeEach(() => {
  clearMailEnv();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  const dataDir = process.env.AUTH_DATA_DIR;
  if (dataDir && dataDir.startsWith(tmpdir())) {
    rmSync(dataDir, { recursive: true, force: true });
  }
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
  it("round-trips through disk and clears", () => {
    expect(getStoredMailAccount()).toBeNull();
    saveStoredMailAccount({
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      user: "alerts@example.com",
      pass: "s3cret",
      from: "BYOV <alerts@example.com>",
    });
    expect(getStoredMailAccount()).toEqual({
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      user: "alerts@example.com",
      pass: "s3cret",
      from: "BYOV <alerts@example.com>",
    });
    clearStoredMailAccount();
    expect(getStoredMailAccount()).toBeNull();
  });

  it("ignores corrupt records", () => {
    writeFileSync(getMailConfigFilePath(), "not json{{{");
    expect(getStoredMailAccount()).toBeNull();
    writeFileSync(getMailConfigFilePath(), JSON.stringify({ host: 42 }));
    expect(getStoredMailAccount()).toBeNull();
  });
});

describe("effective account", () => {
  it("prefers the Settings-saved account over env", () => {
    setEnv({
      SMTP_HOST: "env.example.com",
      SMTP_PORT: "2525",
      SMTP_USER: "env-user",
      SMTP_PASS: "env-pass",
      SMTP_FROM: "env@example.com",
    });
    saveStoredMailAccount({
      host: "smtp.example.com",
      port: 587,
      security: "auto",
      user: "alerts@example.com",
      pass: "s3cret",
      from: "",
    });
    expect(getEffectiveMailAccount()).toMatchObject({
      host: "smtp.example.com",
      port: 587,
      source: "settings",
    });
    clearStoredMailAccount();
    expect(getEffectiveMailAccount()).toMatchObject({
      host: "env.example.com",
      port: 2525,
      user: "env-user",
      source: "env",
    });
  });

  it("falls back to port 587 and the default from on bad env", () => {
    setEnv({ SMTP_HOST: "env.example.com", SMTP_PORT: "bogus" });
    expect(getEffectiveMailAccount()).toMatchObject({
      host: "env.example.com",
      port: DEFAULT_SMTP_PORT,
      from: "BYOV <no-reply@byov.local>",
    });
  });

  it("is null when nothing is configured", () => {
    expect(getEffectiveMailAccount()).toBeNull();
    expect(getMailAccountStatus()).toMatchObject({
      configured: false,
      source: "none",
      hasPassword: false,
    });
  });

  it("status never carries the password", () => {
    setEnv({ SMTP_HOST: "env.example.com", SMTP_PASS: "env-pass" });
    const status = getMailAccountStatus();
    expect(status).toMatchObject({
      configured: true,
      source: "env",
      hasPassword: true,
    });
    expect(JSON.stringify(status)).not.toContain("env-pass");
  });
});
