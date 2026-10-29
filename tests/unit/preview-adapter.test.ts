import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { installPreviewMail, readRequest } from "../../deploy/preview.mjs";

let parent: string; let dir: string; let checkout: string; let source: string;
const account = { host: "smtp.example.test", port: 587, security: "starttls", user: "bot", pass: "s3cret", from: "BYOV <a@b.test>" };
function request(overrides: Record<string, unknown> = {}) {
  return { version: 1, id: path.basename(dir), commit: "a".repeat(40), checkout, directory: dir, source, ports: { web: 41001 }, origin: "http://127.0.0.1:41001", allowEmail: true, ...overrides };
}
beforeEach(() => {
  parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "byov-preview-")));
  dir = path.join(parent, randomUUID());
  checkout = path.join(dir, "checkout"); source = path.join(dir, "source");
  fs.mkdirSync(checkout, { recursive: true }); fs.mkdirSync(source, { recursive: true });
});
afterEach(() => { fs.rmSync(parent, { recursive: true, force: true }); });

it("installs the saved mail account into the preview checkout and redacts its password", () => {
  fs.writeFileSync(path.join(dir, "email-account.json"), JSON.stringify(account));
  const target = installPreviewMail(request());
  expect(target).toBe(path.join(checkout, "data/mail.json"));
  if (!target) throw new Error("Expected the preview mail account to be installed.");
  expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual(account);
  expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  expect(JSON.parse(fs.readFileSync(path.join(dir, "redaction.json"), "utf8"))).toContain("s3cret");
});

it("refuses to prepare email delivery without the copied account", () => {
  expect(() => installPreviewMail(request())).toThrow("mail account is missing");
});

it("refuses an invalid copied mail account", () => {
  fs.writeFileSync(path.join(dir, "email-account.json"), JSON.stringify({ ...account, port: 99999 }));
  expect(() => installPreviewMail(request())).toThrow("mail account is invalid");
});

it("removes any mail account when email sending is off", () => {
  fs.mkdirSync(path.join(checkout, "data"), { recursive: true });
  fs.writeFileSync(path.join(checkout, "data/mail.json"), JSON.stringify(account));
  expect(installPreviewMail(request({ allowEmail: false }))).toBeNull();
  expect(fs.existsSync(path.join(checkout, "data/mail.json"))).toBe(false);
});

it("rejects a non-boolean email flag in the preview request", () => {
  const file = path.join(dir, "request.json");
  fs.writeFileSync(file, JSON.stringify(request({ allowEmail: "yes" })));
  expect(() => readRequest(file)).toThrow("Invalid preview request.");
});

it("accepts a boolean email flag in the preview request", () => {
  for (const allowEmail of [true, false]) {
    const file = path.join(dir, `request-${allowEmail}.json`);
    fs.writeFileSync(file, JSON.stringify(request({ allowEmail })));
    expect(readRequest(file).allowEmail).toBe(allowEmail);
  }
});
