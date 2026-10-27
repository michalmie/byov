import { render, screen } from "@testing-library/react";
import { HealthPill, StatStrip, StatusPill } from "@/components/data-ui";

describe("StatusPill", () => {
  it("renders its label next to a status dot", () => {
    const { container } = render(<StatusPill tone="bad" label="Failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(container.querySelector("span[aria-hidden='true']")).not.toBeNull();
  });
});

describe("HealthPill", () => {
  it.each([
    ["healthy", "Healthy"],
    ["deploying", "Deploying"],
    ["degraded", "Degraded"],
    ["down", "Down"],
  ] as const)("labels %s as %s", (health, label) => {
    render(<HealthPill health={health} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("StatStrip", () => {
  it("renders every value with its qualifier", () => {
    render(
      <StatStrip
        items={[
          { value: "4", qualifier: "Apps" },
          { value: "2", qualifier: "Nodes" },
        ]}
      />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Apps")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Nodes")).toBeInTheDocument();
  });
});
