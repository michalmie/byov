import type { User } from "@/lib/users";
import {
  USERS_STORAGE_KEY,
  authMethodLabel,
  inviteUser,
  parseStoredUsers,
  removeUser,
  setUserRole,
  uniqueUserId,
} from "@/lib/users";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id ?? "user-1",
    email: overrides.email ?? "ada@example.com",
    role: overrides.role ?? "admin",
    ...overrides,
  };
}

describe("users storage key", () => {
  it("uses the users key", () => {
    expect(USERS_STORAGE_KEY).toBe("byov:users:v1");
  });
});

describe("authMethodLabel", () => {
  it("labels every contract method id", () => {
    expect(authMethodLabel("passwordless")).toBe("Passwordless code");
    expect(authMethodLabel("magic-link")).toBe("Email sign-in link");
    expect(authMethodLabel("entra")).toBe("Microsoft Entra ID");
    expect(authMethodLabel("github")).toBe("GitHub");
    expect(authMethodLabel("google")).toBe("Google");
    expect(authMethodLabel("apple")).toBe("Apple");
  });

  it("passes unknown providers through", () => {
    expect(authMethodLabel("saml")).toBe("saml");
  });
});

describe("uniqueUserId", () => {
  it("avoids colliding with existing ids", () => {
    const existing = [makeUser({ id: "user-1" }), makeUser({ id: "user-2" })];
    for (let i = 0; i < 10; i++) {
      expect(["user-1", "user-2"]).not.toContain(uniqueUserId(existing));
    }
  });
});

describe("inviteUser", () => {
  it("invites a valid email with its role", () => {
    const result = inviteUser([], "  Ada@Example.com ", "member");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("ada@example.com");
      expect(result.user.role).toBe("member");
      expect(result.user.id.length).toBeGreaterThan(0);
      expect(result.users).toHaveLength(1);
    }
  });

  it("keeps the existing users untouched", () => {
    const existing = [makeUser()];
    const result = inviteUser(existing, "grace@example.com", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.users).toHaveLength(2);
      expect(existing).toHaveLength(1);
    }
  });

  it("requires an email", () => {
    const result = inviteUser([], "   ", "member");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/email/i);
    }
  });

  it("rejects a malformed email", () => {
    const result = inviteUser([], "not-an-email", "member");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not-an-email/);
    }
  });

  it("guards duplicates case-insensitively", () => {
    const existing = [makeUser({ email: "ada@example.com" })];
    const result = inviteUser(existing, "ADA@EXAMPLE.COM", "member");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already/);
    }
  });
});

describe("removeUser", () => {
  it("removes a member", () => {
    const users = [
      makeUser({ id: "admin-1", role: "admin" }),
      makeUser({ id: "member-1", email: "grace@example.com", role: "member" }),
    ];
    const result = removeUser(users, "member-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.users.map((user) => user.id)).toEqual(["admin-1"]);
    }
  });

  it("removes an admin while another remains", () => {
    const users = [
      makeUser({ id: "admin-1", role: "admin" }),
      makeUser({
        id: "admin-2",
        email: "grace@example.com",
        role: "admin",
      }),
    ];
    const result = removeUser(users, "admin-2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.users.map((user) => user.id)).toEqual(["admin-1"]);
    }
  });

  it("cannot remove the last admin", () => {
    const users = [
      makeUser({ id: "admin-1", role: "admin" }),
      makeUser({ id: "member-1", email: "grace@example.com", role: "member" }),
    ];
    const result = removeUser(users, "admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/last admin/);
    }
  });

  it("reports an unknown id", () => {
    const result = removeUser([makeUser()], "no-such-user");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not found/);
    }
  });
});

describe("setUserRole", () => {
  it("promotes a member to admin", () => {
    const users = [
      makeUser({ id: "admin-1", role: "admin" }),
      makeUser({ id: "member-1", email: "grace@example.com", role: "member" }),
    ];
    const result = setUserRole(users, "member-1", "admin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.users.find((user) => user.id === "member-1")?.role,
      ).toBe("admin");
    }
  });

  it("demotes an admin while another remains", () => {
    const users = [
      makeUser({ id: "admin-1", role: "admin" }),
      makeUser({ id: "admin-2", email: "grace@example.com", role: "admin" }),
    ];
    const result = setUserRole(users, "admin-2", "member");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.users.find((user) => user.id === "admin-2")?.role,
      ).toBe("member");
    }
  });

  it("cannot demote the last admin", () => {
    const users = [makeUser({ id: "admin-1", role: "admin" })];
    const result = setUserRole(users, "admin-1", "member");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/last admin/);
    }
  });

  it("reports an unknown id", () => {
    const result = setUserRole([makeUser()], "no-such-user", "member");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not found/);
    }
  });
});

describe("parseStoredUsers", () => {
  it("round-trips through JSON", () => {
    const users = [
      {
        ...makeUser(),
        name: "Ada Lovelace",
        provider: "github",
        lastLogin: "2026-10-27T10:00:00.000Z",
      },
      makeUser({ id: "user-2", email: "grace@example.com", role: "member" }),
    ];
    expect(parseStoredUsers(JSON.parse(JSON.stringify(users)))).toEqual(users);
  });

  it("reads a non-array as an empty list", () => {
    expect(parseStoredUsers(null)).toEqual([]);
    expect(parseStoredUsers("bogus")).toEqual([]);
    expect(parseStoredUsers({})).toEqual([]);
  });

  it("drops corrupt entries and keeps the valid ones", () => {
    const parsed = parseStoredUsers([
      makeUser(),
      { id: "bad-1", email: "not-an-email", role: "member" },
      { id: "bad-2", email: "fine@example.com", role: "owner" },
      { email: "noid@example.com", role: "member" },
      "bogus",
      null,
    ]);
    expect(parsed).toEqual([makeUser()]);
  });

  it("normalizes stored emails and trims names", () => {
    const parsed = parseStoredUsers([
      {
        id: "user-9",
        email: "  GRACE@Example.COM ",
        name: "  Grace  ",
        role: "member",
        provider: "",
        lastLogin: "",
      },
    ]);
    expect(parsed).toEqual([
      { id: "user-9", email: "grace@example.com", name: "Grace", role: "member" },
    ]);
  });
});
