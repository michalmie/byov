import type { AuthSettings } from "@/lib/auth-settings";
import {
  AUTH_SETTINGS_STORAGE_KEY,
  defaultAuthSettings,
  isValidEmail,
  normalizeList,
  parseStoredAuthSettings,
  splitList,
  validateAuthSettings,
} from "@/lib/auth-settings";

const valid: AuthSettings = {
  passwordlessEnabled: true,
  magicLinkEnabled: true,
  providers: { entra: true, github: false, google: false, apple: false },
  allowedEmails: "ada@example.com, grace@example.com",
  allowedDomains: "example.com",
  adminEmails: "ops@example.com",
  sessionLifetimeHours: 12,
};

describe("defaultAuthSettings", () => {
  it("enables email methods and disables OAuth providers", () => {
    expect(defaultAuthSettings()).toEqual({
      passwordlessEnabled: true,
      magicLinkEnabled: true,
      providers: { entra: false, github: false, google: false, apple: false },
      allowedEmails: "",
      allowedDomains: "",
      adminEmails: "",
      sessionLifetimeHours: 12,
    });
  });

  it("uses the auth settings storage key", () => {
    expect(AUTH_SETTINGS_STORAGE_KEY).toBe("byov:auth-settings:v1");
  });
});

describe("splitList / normalizeList", () => {
  it("splits on commas and drops blanks", () => {
    expect(splitList("a@example.com,, b@example.com , ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("normalizes to one comma-joined line", () => {
    expect(normalizeList("  a@example.com ,,b@example.com ")).toBe(
      "a@example.com, b@example.com",
    );
    expect(normalizeList("   ")).toBe("");
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("ada@example.com")).toBe(true);
    expect(isValidEmail("  Ada@Example.COM ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("two@@example.com")).toBe(false);
    expect(isValidEmail("sp ace@example.com")).toBe(false);
  });

  it("rejects addresses over 200 characters", () => {
    expect(isValidEmail(`${"x".repeat(190)}@example.com`)).toBe(false);
  });
});

describe("validateAuthSettings", () => {
  it("accepts the defaults and a complete draft", () => {
    expect(validateAuthSettings(defaultAuthSettings())).toEqual({});
    expect(validateAuthSettings(valid)).toEqual({});
  });

  it("accepts blank access lists", () => {
    expect(
      validateAuthSettings({
        ...valid,
        allowedEmails: "  ",
        allowedDomains: "",
        adminEmails: " ",
      }),
    ).toEqual({});
  });

  it("accepts toggles in any combination", () => {
    expect(
      validateAuthSettings({
        ...valid,
        passwordlessEnabled: false,
        magicLinkEnabled: false,
        providers: { entra: true, github: true, google: true, apple: true },
      }),
    ).toEqual({});
  });

  it("names the offending email", () => {
    const errors = validateAuthSettings({
      ...valid,
      allowedEmails: "ada@example.com, not-an-email",
    });
    expect(errors.allowedEmails).toMatch(/not-an-email/);
    expect(errors.allowedDomains).toBeUndefined();
  });

  it("caps each email at 200 characters", () => {
    const errors = validateAuthSettings({
      ...valid,
      allowedEmails: `${"x".repeat(190)}@example.com`,
    });
    expect(errors.allowedEmails).toMatch(/200/);
  });

  it("validates the admin list like the allowed list", () => {
    const errors = validateAuthSettings({
      ...valid,
      adminEmails: "ops@example.com, bogus",
    });
    expect(errors.adminEmails).toMatch(/bogus/);
  });

  it("accepts several valid domains", () => {
    expect(
      validateAuthSettings({
        ...valid,
        allowedDomains: "example.com, Research.Example.ORG",
      }),
    ).toEqual({});
  });

  it("names the offending domain", () => {
    const errors = validateAuthSettings({
      ...valid,
      allowedDomains: "example.com, not a zone",
    });
    expect(errors.allowedDomains).toMatch(/not a zone/);
  });

  it("rejects a wildcard prefix in the domain list", () => {
    const errors = validateAuthSettings({
      ...valid,
      allowedDomains: "*.example.com",
    });
    expect(errors.allowedDomains).toMatch(/without the \*\. prefix/);
  });

  it("rejects single-label domains", () => {
    const errors = validateAuthSettings({
      ...valid,
      allowedDomains: "localhost",
    });
    expect(errors.allowedDomains).toMatch(/at least two labels/);
  });

  it("caps each domain at 253 characters", () => {
    const errors = validateAuthSettings({
      ...valid,
      allowedDomains: `${"x".repeat(250)}.com`,
    });
    expect(errors.allowedDomains).toMatch(/253/);
  });

  it("accepts lifetimes from 1 to 720", () => {
    for (const sessionLifetimeHours of [1, 12, 720]) {
      expect(
        validateAuthSettings({ ...valid, sessionLifetimeHours }),
      ).toEqual({});
    }
  });

  it("rejects out-of-range and fractional lifetimes", () => {
    for (const sessionLifetimeHours of [0, -1, 721, 1.5, Number.NaN]) {
      const errors = validateAuthSettings({ ...valid, sessionLifetimeHours });
      expect(errors.sessionLifetimeHours).toMatch(/1 to 720/);
    }
  });
});

describe("parseStoredAuthSettings", () => {
  it("round-trips through JSON", () => {
    const parsed = parseStoredAuthSettings(
      JSON.parse(JSON.stringify(valid)),
    );
    expect(parsed).toEqual(valid);
  });

  it("falls back to defaults for a non-record", () => {
    expect(parseStoredAuthSettings(null)).toEqual(defaultAuthSettings());
    expect(parseStoredAuthSettings("bogus")).toEqual(defaultAuthSettings());
    expect(parseStoredAuthSettings([1, 2])).toEqual(defaultAuthSettings());
  });

  it("keeps valid fields and defaults the corrupt ones", () => {
    const parsed = parseStoredAuthSettings({
      passwordlessEnabled: false,
      magicLinkEnabled: "yes",
      providers: { entra: true, github: "nope", extra: true },
      allowedEmails: 42,
      allowedDomains: "example.com",
      adminEmails: null,
      sessionLifetimeHours: 9999,
    });
    expect(parsed).toEqual({
      passwordlessEnabled: false,
      magicLinkEnabled: true,
      providers: { entra: true, github: false, google: false, apple: false },
      allowedEmails: "",
      allowedDomains: "example.com",
      adminEmails: "",
      sessionLifetimeHours: 12,
    });
  });

  it("defaults a non-integer lifetime", () => {
    expect(
      parseStoredAuthSettings({ sessionLifetimeHours: 2.5 })
        .sessionLifetimeHours,
    ).toBe(12);
  });
});
