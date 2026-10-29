import { render } from "@testing-library/react";
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
    const img = headerLink?.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("BYOV");
    expect(img?.getAttribute("src")).toContain("byov-logo-stacked-1536x1024");
    expect(img?.getAttribute("class")).toContain("w-full");
  });
});
