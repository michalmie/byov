import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
  isMailConfigured,
  magicLinkEmail,
  otpEmail,
  sendMail,
  signInEmail,
} from "@/lib/auth-mail";
import { saveStoredMailAccount } from "@/lib/mail-config";

const savedEnv = { ...process.env };

beforeEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  // Fresh temp data dir: config resolution must never see the real ./data.
  process.env.AUTH_DATA_DIR = mkdtempSync(join(tmpdir(), "byov-mail-test-"));
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

describe("isMailConfigured", () => {
  it("is false without SMTP_HOST and true with one", () => {
    expect(isMailConfigured()).toBe(false);
    process.env.SMTP_HOST = "smtp.example.com";
    expect(isMailConfigured()).toBe(true);
    process.env.SMTP_HOST = "   ";
    expect(isMailConfigured()).toBe(false);
  });

  it("is true with a Settings-saved account even without env", () => {
    expect(isMailConfigured()).toBe(false);
    saveStoredMailAccount({
      host: "smtp.example.com",
      port: 587,
      security: "auto",
      user: "",
      pass: "",
      from: "",
    });
    expect(isMailConfigured()).toBe(true);
  });
});

describe("sendMail dev fallback", () => {
  it("resolves and logs instead of sending when SMTP is unset", async () => {
    await expect(
      sendMail({
        to: "ada@example.com",
        subject: "Your BYOV sign-in code",
        text: "Your BYOV sign-in code is 123456.",
      }),
    ).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.log).mock.calls[0]?.[0]).toContain(
      "ada@example.com",
    );
  });
});

describe("auth email templates", () => {
  it("builds the OTP email with the code", () => {
    const mail = otpEmail("123456");
    expect(mail.subject).toContain("sign-in code");
    expect(mail.text).toContain("123456");
  });

  it("builds the magic-link email with the link", () => {
    const mail = magicLinkEmail("https://byov.test/api/auth/magic-link/verify?token=x");
    expect(mail.subject).toContain("sign-in link");
    expect(mail.text).toContain(
      "https://byov.test/api/auth/magic-link/verify?token=x",
    );
    expect(mail.text).toContain("10 minutes");
  });

  it("builds one email carrying both the code and the link", () => {
    const mail = signInEmail({
      code: "123456",
      link: "https://byov.test/api/auth/magic-link/verify?token=x",
    });
    expect(mail.subject).toContain("code and link");
    expect(mail.text).toContain("123456");
    expect(mail.text).toContain(
      "https://byov.test/api/auth/magic-link/verify?token=x",
    );
  });

  it("falls back to the single-method template when only one is given", () => {
    expect(signInEmail({ code: "123456" })).toEqual(otpEmail("123456"));
    const link = "https://byov.test/api/auth/magic-link/verify?token=x";
    expect(signInEmail({ link })).toEqual(magicLinkEmail(link));
    expect(() => signInEmail({})).toThrow();
  });
});
