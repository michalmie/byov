import { buildSiteTitle, summarizeDatabaseProfile } from "@/lib/site";

describe("buildSiteTitle", () => {
  it("returns the site name when the title matches", () => {
    expect(buildSiteTitle("BYOV", "BYOV")).toBe(
      "BYOV",
    );
  });

  it("composes a page title when it differs from the site name", () => {
    expect(buildSiteTitle("Pricing", "BYOV")).toBe(
      "Pricing | BYOV",
    );
  });
});

describe("summarizeDatabaseProfile", () => {
  it("explains sqlite clearly", () => {
    expect(summarizeDatabaseProfile(true, "sqlite")).toContain("SQLite");
  });

  it("reports no database when disabled", () => {
    expect(summarizeDatabaseProfile(false, "none")).toBe("No database");
  });
});
