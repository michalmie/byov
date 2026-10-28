import { fireEvent, render, screen } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { Node } from "@/lib/control-plane";
import { NodeCard } from "@/components/node-card";

const NODE: Node = {
  slug: "coolify-frankfurt",
  name: "frankfurt-01",
  kind: "Coolify",
  location: "Frankfurt",
  status: "healthy",
  endpoint: "https://coolify.example.com",
};

function callbacks() {
  return {
    onManage: vi.fn(),
    onRemove: vi.fn(),
    onConfirmRemove: vi.fn(),
    onCancelRemove: vi.fn(),
  };
}

describe("NodeCard", () => {
  it("renders name, slug, kind tag, and the Coolify blurb", () => {
    render(
      <NodeCard
        node={NODE}
        isDefault={false}
        usage={[]}
        removeState="ready"
        {...callbacks()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "frankfurt-01" }),
    ).toBeInTheDocument();
    expect(screen.getByText("coolify-frankfurt")).toBeInTheDocument();
    expect(screen.getByText("Coolify")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Provision and deploy applications through a Coolify instance.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  it("marks the default node", () => {
    render(
      <NodeCard
        node={NODE}
        isDefault
        usage={[]}
        removeState="ready"
        {...callbacks()}
      />,
    );
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("shows instance, location, and pinned environments", () => {
    render(
      <NodeCard
        node={NODE}
        isDefault={false}
        usage={[
          { appSlug: "shopfloor-tickets", appName: "Shopfloor Tickets", env: "production" },
          { appSlug: "shopfloor-tickets", appName: "Shopfloor Tickets", env: "staging" },
        ]}
        removeState="pinned"
        {...callbacks()}
      />,
    );
    expect(screen.getByText("Instance")).toBeInTheDocument();
    expect(
      screen.getByText("https://coolify.example.com"),
    ).toBeInTheDocument();
    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByText("Frankfurt")).toBeInTheDocument();
    expect(screen.getByText("Environments")).toBeInTheDocument();
    expect(screen.getByText("2 pinned")).toBeInTheDocument();
  });

  it("falls back when the endpoint and usage are missing", () => {
    const { container } = render(
      <NodeCard
        node={{ ...NODE, endpoint: undefined, status: "pending" }}
        isDefault={false}
        usage={[]}
        removeState="ready"
        {...callbacks()}
      />,
    );
    expect(screen.getByText("No endpoint configured")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(
      container.querySelector("dd[title='No environments pinned']"),
    ).not.toBeNull();
  });

  it("calls Manage and Remove", () => {
    const calls = callbacks();
    render(
      <NodeCard
        node={NODE}
        isDefault={false}
        usage={[]}
        removeState="ready"
        {...calls}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(calls.onManage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(calls.onRemove).toHaveBeenCalledTimes(1);
  });

  it("disables Remove while environments are pinned", () => {
    render(
      <NodeCard
        node={NODE}
        isDefault={false}
        usage={[
          { appSlug: "shopfloor-tickets", appName: "Shopfloor Tickets", env: "production" },
        ]}
        removeState="pinned"
        {...callbacks()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Remove" }),
    ).toBeDisabled();
  });

  it("confirms or keeps a removal", () => {
    const calls = callbacks();
    render(
      <NodeCard
        node={NODE}
        isDefault={false}
        usage={[]}
        removeState="confirming"
        {...calls}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(calls.onConfirmRemove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(calls.onCancelRemove).toHaveBeenCalledTimes(1);
  });
});
