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

  it("proposes a copyable AGENTS.md starter in agent mode", () => {
    renderGuide();
    expect(
      screen.getByText(/Save the AGENTS\.md starter/),
    ).toBeInTheDocument();
    const prompt = screen.getByText(/agent instructions/);
    expect(prompt.textContent).toContain(app.slug);
    expect(prompt.textContent).toContain(
      "npm run test:unit && npm run lint && npm run build",
    );
    expect(
      screen.getByRole("button", { name: "Copy AGENTS.md" }),
    ).toBeInTheDocument();
  });

  it("keeps step numbers sequential in agent mode", () => {
    renderGuide();
    const numbers = screen
      .getAllByText(/^(01|02|03|04|05)$/)
      .map((node) => node.textContent);
    expect(numbers).toEqual(["01", "02", "03", "04", "05"]);
  });

  it("hides the AGENTS.md starter outside agent mode", () => {
    renderGuide();
    fireEvent.click(screen.getByRole("button", { name: /Run My Code/ }));
    expect(
      screen.queryByText(/Save the AGENTS\.md starter/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/agent instructions/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Run AI-Generated Code/ }),
    );
    expect(
      screen.queryByText(/Save the AGENTS\.md starter/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/agent instructions/)).not.toBeInTheDocument();
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
    // Both the ship-step copy and the embedded AGENTS.md starter degrade
    // gracefully when the app has no stack commands.
    expect(screen.getAllByText(/no stack commands/)).toHaveLength(2);
  });

  it("uses node-neutral FQDN copy for every node kind", () => {
    const { container } = renderGuide();
    expect(screen.getByText(/the node FQDN, your API base/)).toBeInTheDocument();
    expect(
      screen.getByText(/points its\s+FQDN at the Sandbox URL/),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Coolify FQDN/);
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
