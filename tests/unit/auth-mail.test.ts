import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
  emailShell,
  isMailConfigured,
  magicLinkEmail,
  otpEmail,
  sendMail,
  signInEmail,
  testEmailHtml,
} from "@/lib/auth-mail";
import { saveStoredMailAccount } from "@/lib/mail-config";

const savedEnv = { ...process.env };

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
  };
});

async function resetFakeDb(): Promise<void> {
  const db = (await import("@/lib/db")) as unknown as {
    __resetFakeDb: () => void;
  };
  db.__resetFakeDb();
}

beforeEach(async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  await resetFakeDb();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
});

describe("isMailConfigured", () => {
  it("is false without SMTP_HOST and true with one", async () => {
    expect(await isMailConfigured()).toBe(false);
    process.env.SMTP_HOST = "smtp.example.com";
    expect(await isMailConfigured()).toBe(true);
    process.env.SMTP_HOST = "   ";
    expect(await isMailConfigured()).toBe(false);
  });

  it("is true with a Settings-saved account even without env", async () => {
    expect(await isMailConfigured()).toBe(false);
    await saveStoredMailAccount({
      host: "smtp.example.com",
      port: 587,
      security: "auto",
      user: "",
      pass: "",
      from: "",
    });
    expect(await isMailConfigured()).toBe(true);
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
    expect(mail.subject).toBe("123456 is your BYOV sign-in code");
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
    expect(mail.subject).toBe("123456 is your BYOV sign-in code");
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

  it("renders the code email as branded HTML", () => {
    const mail = otpEmail("123456");
    expect(mail.html).toContain("<!doctype html>");
    expect(mail.html).toContain("123456");
    expect(mail.html).toContain("BYOV");
    expect(mail.html).toContain("monospace");
    expect(mail.html).not.toContain("Sign in to BYOV</a>");
  });

  it("renders the link email with a sign-in button and URL fallback", () => {
    const link = "https://byov.test/api/auth/magic-link/verify?token=x&next=%2F";
    const mail = magicLinkEmail(link);
    expect(mail.html).toContain("Sign in to BYOV</a>");
    // Query-string ampersands are entity-escaped inside hrefs.
    expect(mail.html).toContain(
      "https://byov.test/api/auth/magic-link/verify?token=x&amp;next=%2F",
    );
    expect(mail.html).toContain("Or paste this link into your browser");
  });

  it("renders the combined email with both the code and the button", () => {
    const mail = signInEmail({
      code: "123456",
      link: "https://byov.test/api/auth/magic-link/verify?token=x",
    });
    expect(mail.html).toContain("123456");
    expect(mail.html).toContain("Sign in to BYOV</a>");
  });

  it("centers the code and button with table cells for Outlook", () => {
    const mail = signInEmail({
      code: "123456",
      link: "https://byov.test/api/auth/magic-link/verify?token=x",
    });
    // Bulletproof centering: the align attribute on the cell, not div CSS
    // alone, which Outlook renders inconsistently.
    expect(mail.html).toMatch(/<td align="center"[^>]*>123456<\/td>/);
    expect(mail.html).toMatch(
      /<td align="center"[^>]*><a [^>]*>Sign in to BYOV<\/a>/,
    );
  });

  it("keeps a long pasted link from stretching the card", () => {
    const mail = magicLinkEmail(`https://byov.test/${"x".repeat(500)}`);
    expect(mail.html).toContain("table-layout:fixed");
    expect(mail.html).toContain("word-break:break-all");
  });

  it("escapes markup smuggled into template inputs", () => {
    const mail = signInEmail({
      code: "12<script>alert(1)</script>",
      link: 'https://byov.test/"onmouseover="alert(1)',
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&quot;onmouseover=&quot;");
    expect(emailShell({ heading: "<b>Hi</b>", bodyHtml: "<p>x</p>" })).toContain(
      "&lt;b&gt;Hi&lt;/b&gt;",
    );
  });

  it("renders the test email without the expiry footer", () => {
    const html = testEmailHtml("Settings-saved");
    expect(html).toContain("BYOV test email");
    expect(html).toContain("Settings-saved sending account");
    expect(html).not.toContain("expire in 10 minutes");
  });
});
