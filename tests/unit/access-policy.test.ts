import {
  defaultAccessPolicy,
  evaluateAccess,
  normalizeAccessPolicy,
  parseAccessPolicy,
  validateAccessPolicy,
} from "@/lib/access-policy";
import type { AccessPolicy } from "@/lib/control-plane";

function policy(overrides: Partial<AccessPolicy> = {}): AccessPolicy {
  return { scope: "restricted", rules: [], ...overrides };
}

describe("defaultAccessPolicy", () => {
  it("defaults to workspace-only, never public", () => {
    expect(defaultAccessPolicy()).toEqual({ scope: "workspace", rules: [] });
  });
});

describe("validateAccessPolicy", () => {
  it("accepts public and workspace without rules", () => {
    expect(validateAccessPolicy(policy({ scope: "public" }))).toBeNull();
    expect(validateAccessPolicy(policy({ scope: "workspace" }))).toBeNull();
  });

  it("requires at least one allow rule when restricted", () => {
    expect(validateAccessPolicy(policy())).toMatch(/allow rule/i);
    expect(
      validateAccessPolicy(
        policy({ rules: [{ id: "r1", effect: "deny", type: "cidr", value: "10.0.0.0/8" }] }),
      ),
    ).toMatch(/allow rule/i);
  });

  it("accepts IP and CIDR rules for v4 and v6", () => {
    for (const [type, value] of [
      ["ip", "203.0.113.10"],
      ["ip", "2001:db8::1"],
      ["cidr", "203.0.113.0/24"],
      ["cidr", "2001:db8::/32"],
    ] as const) {
      expect(
        validateAccessPolicy(
          policy({ rules: [{ id: "r1", effect: "allow", type, value }] }),
        ),
      ).toBeNull();
    }
  });

  it("rejects malformed IP, CIDR, email, domain and country values", () => {
    for (const [type, value] of [
      ["ip", "999.1.1.1"],
      ["ip", "not-an-ip"],
      ["cidr", "203.0.113.0/33"],
      ["cidr", "203.0.113.0"],
      ["email", "not-an-email"],
      ["emailDomain", "not a domain"],
      ["country", "XX1"],
      ["network", "mars"],
    ] as const) {
      expect(
        validateAccessPolicy(
          policy({ rules: [{ id: "r1", effect: "allow", type, value }] }),
        ),
      ).not.toBeNull();
    }
  });

  it("rejects unknown scopes and rule types", () => {
    expect(
      validateAccessPolicy({ scope: "secret" as never, rules: [] }),
    ).not.toBeNull();
    expect(
      validateAccessPolicy(
        policy({ rules: [{ id: "r1", effect: "allow", type: "fingerprint" as never, value: "x" }] }),
      ),
    ).not.toBeNull();
  });
});

describe("normalizeAccessPolicy", () => {
  it("trims, lowercases identity values and dedupes rules", () => {
    const normalized = normalizeAccessPolicy(
      policy({
        rules: [
          { id: "", effect: "allow", type: "email", value: "  Ada@Example.com " },
          { id: "", effect: "allow", type: "email", value: "ada@example.com" },
          { id: "", effect: "allow", type: "cidr", value: " 203.0.113.0/24 " },
        ],
      }),
    );
    expect(normalized.rules).toHaveLength(2);
    expect(normalized.rules[0].value).toBe("ada@example.com");
    expect(normalized.rules.every((rule) => rule.id.length > 0)).toBe(true);
  });

  it("falls back to the workspace default for missing input", () => {
    expect(normalizeAccessPolicy(undefined)).toEqual(defaultAccessPolicy());
    expect(normalizeAccessPolicy(null)).toEqual(defaultAccessPolicy());
  });
});

describe("parseAccessPolicy", () => {
  it("round-trips a stored policy and drops invalid ones", () => {
    const stored = policy({
      rules: [{ id: "r1", effect: "allow", type: "cidr", value: "10.0.0.0/8" }],
    });
    expect(parseAccessPolicy(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(parseAccessPolicy({ scope: "nope", rules: [] })).toBeUndefined();
    expect(parseAccessPolicy("public")).toBeUndefined();
    expect(parseAccessPolicy(undefined)).toBeUndefined();
  });
});

describe("evaluateAccess", () => {
  it("allows everyone when public, unless a deny rule matches", () => {
    expect(evaluateAccess(policy({ scope: "public" }), {}).allowed).toBe(true);
    const guarded = policy({
      scope: "public",
      rules: [{ id: "r1", effect: "deny", type: "cidr", value: "203.0.113.0/24" }],
    });
    expect(evaluateAccess(guarded, { ip: "203.0.113.9" }).allowed).toBe(false);
    expect(evaluateAccess(guarded, { ip: "198.51.100.9" }).allowed).toBe(true);
  });

  it("allows only authenticated workspace members in workspace scope", () => {
    const workspace = policy({ scope: "workspace" });
    expect(evaluateAccess(workspace, {}).allowed).toBe(false);
    expect(
      evaluateAccess(workspace, { authenticated: true, isWorkspaceMember: false }).allowed,
    ).toBe(false);
    expect(
      evaluateAccess(workspace, { authenticated: true, isWorkspaceMember: true }).allowed,
    ).toBe(true);
  });

  it("denies restricted visitors by default and allows matching IPs", () => {
    const restricted = policy({
      rules: [
        { id: "r1", effect: "allow", type: "cidr", value: "203.0.113.0/24" },
        { id: "r2", effect: "allow", type: "ip", value: "2001:db8::5" },
      ],
    });
    expect(evaluateAccess(restricted, { ip: "198.51.100.1" }).allowed).toBe(false);
    expect(evaluateAccess(restricted, { ip: "203.0.113.42" }).allowed).toBe(true);
    expect(evaluateAccess(restricted, { ip: "2001:db8::5" }).allowed).toBe(true);
    expect(evaluateAccess(restricted, {}).allowed).toBe(false);
  });

  it("matches email, domain, group, network and country rules", () => {
    const restricted = policy({
      rules: [
        { id: "r1", effect: "allow", type: "emailDomain", value: "partner.example" },
        { id: "r2", effect: "allow", type: "group", value: "finance" },
        { id: "r3", effect: "allow", type: "network", value: "tailnet" },
      ],
    });
    expect(evaluateAccess(restricted, { email: "a@partner.example" }).allowed).toBe(true);
    expect(evaluateAccess(restricted, { email: "a@other.example" }).allowed).toBe(false);
    expect(evaluateAccess(restricted, { groups: ["finance"] }).allowed).toBe(true);
    expect(evaluateAccess(restricted, { network: "tailnet" }).allowed).toBe(true);
    expect(evaluateAccess(restricted, { network: "local" }).allowed).toBe(false);
  });

  it("lets deny win and enforces requireAuth", () => {
    const restricted = policy({
      requireAuth: true,
      rules: [
        { id: "r1", effect: "allow", type: "emailDomain", value: "example.com" },
        { id: "r2", effect: "deny", type: "email", value: "blocked@example.com" },
      ],
    });
    expect(evaluateAccess(restricted, { email: "a@example.com" }).allowed).toBe(false);
    expect(
      evaluateAccess(restricted, { email: "a@example.com", authenticated: true }).allowed,
    ).toBe(true);
    expect(
      evaluateAccess(restricted, { email: "blocked@example.com", authenticated: true }).allowed,
    ).toBe(false);
  });
});
