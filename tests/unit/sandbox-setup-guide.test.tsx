import { fireEvent, render, screen } from "@testing-library/react";
import { SandboxSetupGuide } from "@/components/sandbox-setup-guide";
import { buildApp } from "@/lib/apps";
import { listApps, listNodes } from "@/lib/control-plane";
import { listStacks } from "@/lib/stacks";

const app = buildApp(
  {
    name: "Rota Planner",
    slug: "",
    description: "Shift planning without the spreadsheet.",
    stack: listStacks()[0].slug,
    node: listNodes()[0].slug,
  },
  listApps(),
);

const stacklessApp = buildApp(
  {
    name: "Plain App",
    slug: "",
    description: "",
    stack: "",
    node: listNodes()[0].slug,
  },
  listApps(),
);

function renderGuide() {
  return render(<SandboxSetupGuide app={app} />);
}

describe("SandboxSetupGuide", () => {
  it("offers the three Sandbox modes", () => {
    renderGuide();
    expect(
      screen.getByRole("heading", {
        name: "Get started with the Rota Planner Sandbox",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Run a Coding Agent/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Run My Code/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Run AI-Generated Code/ }),
    ).toBeInTheDocument();
  });

  it("switches the agent start command per agent tab", () => {
    renderGuide();
    expect(screen.getByText("claude")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Codex" }));
    expect(screen.getByText("codex")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OpenCode" }));
    expect(screen.getByText("opencode")).toBeInTheDocument();
  });

  it("shows the local run step for My Code", () => {
    renderGuide();
    fireEvent.click(screen.getByRole("button", { name: /Run My Code/ }));
    expect(screen.getByText(/Run it on your machine/)).toBeInTheDocument();
    expect(screen.getByText("npm run dev")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Codex" }),
    ).not.toBeInTheDocument();
  });

  it("shows the review step for AI-generated code", () => {
    renderGuide();
    fireEvent.click(
      screen.getByRole("button", { name: /Run AI-Generated Code/ }),
    );
    expect(
      screen.getByText(/Bring the generated code in/),
    ).toBeInTheDocument();
  });

  it("shows the station connection facts with a copyable URL", () => {
    renderGuide();
    expect(
      screen.getByText(/Connect your station to the Sandbox/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        `https://${app.slug}-sandbox.${listNodes()[0].domainZone}`,
      ),
    ).toHaveLength(2);
  });

  it("guides stack-less apps without a starter", () => {
    render(<SandboxSetupGuide app={stacklessApp} />);
    expect(screen.getByText(/Start from your own code/)).toBeInTheDocument();
    expect(screen.getByText(/no stack commands/)).toBeInTheDocument();
  });

  it("shows the gates and the resolved Sandbox URL", () => {
    renderGuide();
    expect(
      screen.getByText("npm run test:unit && npm run lint && npm run build"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: `https://${app.slug}-sandbox.${listNodes()[0].domainZone}`,
    });
    expect(link).toHaveAttribute(
      "href",
      `https://${app.slug}-sandbox.${listNodes()[0].domainZone}`,
    );
  });
});
