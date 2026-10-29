import { render } from "@testing-library/react";
import { Logo, LogoMark } from "@/components/logo";

describe("LogoMark", () => {
  it("renders the octopus mascot as a decorative image", () => {
    const { container } = render(<LogoMark />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("src")).toContain("byov-mark-512");
  });

  it("defaults to the 32px sidebar size so the mascot stays legible", () => {
    const { container } = render(<LogoMark />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("class")).toContain("h-8 w-8");
  });
});

describe("Logo", () => {
  it("renders the horizontal lockup with the BYOV wordmark", () => {
    const { container } = render(<Logo />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("BYOV");
    expect(img?.getAttribute("src")).toContain("byov-logo-horizontal-1400");
  });
});
