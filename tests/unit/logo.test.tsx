import { render, screen } from "@testing-library/react";
import { Logo, LogoMark } from "@/components/logo";

describe("LogoMark", () => {
  it("renders the octopus mascot as a decorative image", () => {
    const { container } = render(<LogoMark />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("src")).toContain("byov-octopus");
  });

  it("defaults to the 32px sidebar size so the mascot stays legible", () => {
    const { container } = render(<LogoMark />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("class")).toContain("h-8 w-8");
  });
});

describe("Logo", () => {
  it("renders the mark next to the BYOV wordmark", () => {
    const { container } = render(<Logo />);
    expect(screen.getByText("BYOV")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeNull();
  });
});
