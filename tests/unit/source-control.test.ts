import type { SourceControlSettings } from "@/lib/source-control";
import {
  SOURCE_CONTROL_STORAGE_KEY,
  canCreateRepos,
  defaultSourceControlSettings,
  isGitHubLogin,
  isValidRepoAffix,
  normalizeSourceControlSettings,
  normalizeTopics,
  parseStoredSourceControlSettings,
  resolveRepoFullName,
  resolveRepoName,
  resolveRepoUrl,
  splitTopics,
  validateSourceControlSettings,
} from "@/lib/source-control";

const linked: SourceControlSettings = {
  provider: "github",
  connected: true,
  accountType: "organization",
  accountLogin: "acme-labs",
  installationId: "12345678",
  defaultVisibility: "private",
  allowPublicRepos: false,
  repoPattern: "byov-{app-slug}",
  repoPrefix: "byov-",
  repoSuffix: "",
  defaultBranch: "main",
  autoCreateRepo: true,
  topics: "byov, internal-tools",
};

describe("defaultSourceControlSettings", () => {
  it("starts unlinked, private by default, with the byov- prefix", () => {
    expect(defaultSourceControlSettings()).toEqual({
      provider: "github",
      connected: false,
      accountType: "organization",
      accountLogin: "",
      installationId: "",
      defaultVisibility: "private",
      allowPublicRepos: false,
      repoPattern: "byov-{app-slug}",
      repoPrefix: "byov-",
      repoSuffix: "",
      defaultBranch: "main",
      autoCreateRepo: true,
      topics: "byov",
    });
    expect(SOURCE_CONTROL_STORAGE_KEY).toBe("byov:source-control:v1");
  });
});

describe("isGitHubLogin", () => {
  it("accepts usernames and org logins", () => {
    expect(isGitHubLogin("ada-dev")).toBe(true);
    expect(isGitHubLogin("acme-labs")).toBe(true);
    expect(isGitHubLogin("a")).toBe(true);
    expect(isGitHubLogin("Ada9")).toBe(true);
  });

  it("rejects malformed logins", () => {
    expect(isGitHubLogin("")).toBe(false);
    expect(isGitHubLogin("-ada")).toBe(false);
    expect(isGitHubLogin("ada-")).toBe(false);
    expect(isGitHubLogin("ada--dev")).toBe(false);
    expect(isGitHubLogin("ada_dev")).toBe(false);
    expect(isGitHubLogin("ada dev")).toBe(false);
    expect(isGitHubLogin("x".repeat(40))).toBe(false);
  });
});

describe("isValidRepoAffix / topics helpers", () => {
  it("accepts safe prefixes and suffixes", () => {
    expect(isValidRepoAffix("byov-")).toBe(true);
    expect(isValidRepoAffix("")).toBe(true);
    expect(isValidRepoAffix("-app")).toBe(true);
    expect(isValidRepoAffix("BYOV-")).toBe(true);
  });

  it("rejects unsafe affixes", () => {
    expect(isValidRepoAffix("by ov")).toBe(false);
    expect(isValidRepoAffix("byov/")).toBe(false);
    expect(isValidRepoAffix(".")).toBe(false);
    expect(isValidRepoAffix("x".repeat(31))).toBe(false);
  });

  it("splits and normalizes topics", () => {
    expect(splitTopics("Byov,, Internal-Tools ")).toEqual([
      "byov",
      "internal-tools",
    ]);
    expect(normalizeTopics("  byov,, internal-tools ")).toBe(
      "byov, internal-tools",
    );
    expect(normalizeTopics("   ")).toBe("");
  });
});

describe("validateSourceControlSettings", () => {
  it("accepts the defaults and a linked draft", () => {
    expect(validateSourceControlSettings(defaultSourceControlSettings())).toEqual({});
    expect(validateSourceControlSettings(linked)).toEqual({});
  });

  it("requires a login once connected", () => {
    const errors = validateSourceControlSettings({
      ...linked,
      accountLogin: "  ",
    });
    expect(errors.accountLogin).toMatch(/Organization login/);
  });

  it("names a malformed login", () => {
    const errors = validateSourceControlSettings({
      ...linked,
      accountLogin: "-bad--login",
    });
    expect(errors.accountLogin).toMatch(/single hyphens/);
  });

  it("rejects a non-numeric installation id", () => {
    const errors = validateSourceControlSettings({
      ...linked,
      installationId: "abc",
    });
    expect(errors.installationId).toMatch(/numeric/);
  });

  it("keeps repos private unless public is allowed", () => {
    const errors = validateSourceControlSettings({
      ...linked,
      defaultVisibility: "public",
      allowPublicRepos: false,
    });
    expect(errors.defaultVisibility).toMatch(/Public repos are disabled/);
    expect(
      validateSourceControlSettings({
        ...linked,
        defaultVisibility: "public",
        allowPublicRepos: true,
      }),
    ).toEqual({});
  });

  it("validates the repo pattern, branch and topics", () => {
    expect(
      validateSourceControlSettings({ ...linked, repoPattern: "byov-app" })
        .repoPattern,
    ).toMatch(/\{app-slug\}/);
    expect(
      validateSourceControlSettings({ ...linked, repoPattern: "a/b-{app-slug}" })
        .repoPattern,
    ).toMatch(/lowercase/);
    expect(
      validateSourceControlSettings({
        ...linked,
        repoPattern: "{app-slug}-{app-slug}",
      }).repoPattern,
    ).toBeTruthy();
    expect(
      validateSourceControlSettings({ ...linked, defaultBranch: "" })
        .defaultBranch,
    ).toMatch(/default branch/);
    expect(
      validateSourceControlSettings({ ...linked, topics: "Bad Topic!" })
        .topics,
    ).toMatch(/not a valid topic/);
  });
});

describe("repo taxonomy resolver", () => {
  it("applies prefix + slug by default", () => {
    expect(resolveRepoName(linked, "rota-planner")).toBe("byov-rota-planner");
    expect(resolveRepoFullName(linked, "rota-planner")).toBe(
      "acme-labs/byov-rota-planner",
    );
    expect(resolveRepoUrl(linked, "rota-planner")).toBe(
      "https://github.com/acme-labs/byov-rota-planner",
    );
  });

  it("honors a custom pattern", () => {
    const custom = {
      ...linked,
      repoPattern: "apps-{app-slug}-svc",
      repoPrefix: "apps-",
      repoSuffix: "-svc",
    };
    expect(resolveRepoName(custom, "rota-planner")).toBe(
      "apps-rota-planner-svc",
    );
  });

  it("sanitizes slugs and falls back without an owner", () => {
    expect(resolveRepoName(linked, "Rota Planner!")).toBe("byov-rota-planner");
    expect(resolveRepoName(linked, "")).toBe("byov-app");
    expect(
      resolveRepoFullName(defaultSourceControlSettings(), "rota-planner"),
    ).toBe("byov-rota-planner");
    expect(resolveRepoUrl(defaultSourceControlSettings(), "rota-planner")).toBe("");
  });

  it("truncates to 100 chars without a dangling separator", () => {
    const name = resolveRepoName(linked, "x".repeat(120));
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith("-")).toBe(false);
    expect(name.endsWith(".")).toBe(false);
  });

  it("reports canCreateRepos only for a valid linked account", () => {
    expect(canCreateRepos(linked)).toBe(true);
    expect(canCreateRepos(defaultSourceControlSettings())).toBe(false);
    expect(canCreateRepos({ ...linked, accountLogin: "-bad" })).toBe(false);
  });
});

describe("parseStoredSourceControlSettings", () => {
  it("round-trips through JSON", () => {
    expect(
      parseStoredSourceControlSettings(JSON.parse(JSON.stringify(linked))),
    ).toEqual(linked);
  });

  it("falls back to defaults for a non-record", () => {
    expect(parseStoredSourceControlSettings(null)).toEqual(
      defaultSourceControlSettings(),
    );
    expect(parseStoredSourceControlSettings("bogus")).toEqual(
      defaultSourceControlSettings(),
    );
  });

  it("keeps valid fields and defaults the corrupt ones", () => {
    const parsed = parseStoredSourceControlSettings({
      connected: true,
      accountType: "user",
      accountLogin: "ada-dev",
      installationId: "42",
      defaultVisibility: "internal",
      allowPublicRepos: "yes",
      repoPrefix: "bad prefix!",
      repoSuffix: "-ok",
      defaultBranch: "",
      autoCreateRepo: false,
      topics: 42,
    });
    expect(parsed).toEqual({
      provider: "github",
      connected: true,
      accountType: "user",
      accountLogin: "ada-dev",
      installationId: "42",
      defaultVisibility: "private",
      allowPublicRepos: false,
      repoPattern: "byov-{app-slug}-ok",
      repoPrefix: "byov-",
      repoSuffix: "-ok",
      defaultBranch: "main",
      autoCreateRepo: false,
      topics: "byov",
    });
  });
});

describe("normalizeSourceControlSettings", () => {
  it("trims the login, derives affixes from the pattern, and lowers topics", () => {
    expect(
      normalizeSourceControlSettings({
        ...linked,
        accountLogin: "  Acme-Labs ",
        repoPattern: " APPS-{app-slug}-SVC ",
        topics: " BYOV,, Internal ",
      }),
    ).toMatchObject({
      accountLogin: "Acme-Labs",
      repoPattern: "apps-{app-slug}-svc",
      repoPrefix: "apps-",
      repoSuffix: "-svc",
      topics: "byov, internal",
    });
  });

  it("derives the pattern from legacy affixes when none is stored", () => {
    const parsed = parseStoredSourceControlSettings({
      repoPrefix: "apps-",
      repoSuffix: "-svc",
    });
    expect(parsed.repoPattern).toBe("apps-{app-slug}-svc");
    expect(parsed.provider).toBe("github");
  });
});
