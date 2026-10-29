import { render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { Sidebar } from "@/components/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("Sidebar header", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  });

  it("renders the BYOV lockup as the home link brand", () => {
    const { container } = render(<Sidebar open={true} onClose={() => {}} />);
    const headerLink = container.querySelector('a[href="/"]');
    expect(headerLink).not.toBeNull();
    expect(headerLink?.getAttribute("class")).toContain("max-w-[140px]");
    const img = headerLink?.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("BYOV");
    expect(img?.getAttribute("src")).toContain("byov-logo-stacked-1536x1024");
    expect(img?.getAttribute("class")).toContain("w-full");
  });

  it("has no close button; the drawer closes via the scrim or Escape", () => {
    render(<Sidebar open={true} onClose={() => {}} />);
    expect(
      screen.queryByRole("button", { name: "Close navigation" }),
    ).toBeNull();
  });
});
