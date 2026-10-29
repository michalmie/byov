import { fireEvent, render, screen } from "@testing-library/react";
import { expect, vi } from "vitest";
import { AgentsPromptCard } from "@/components/agents-prompt-card";
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

const bareApp = buildApp(
  {
    name: "Plain App",
    slug: "",
    description: "",
    stack: "",
    node: "no-such-node",
  },
  listApps(),
);

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe("AgentsPromptCard", () => {
  it("renders the prompt text for the app", () => {
    render(<AgentsPromptCard app={app} />);
    expect(
      screen.getByRole("heading", { name: "Agent instructions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`# ${app.name} — agent instructions`, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tech stack:/)).toBeInTheDocument();
    expect(
      screen.getByText(
        `https://${app.slug}-sandbox.${listNodes()[0].domainZone}`,
        { exact: false },
      ),
    ).toBeInTheDocument();
  });

  it("writes the prompt to the clipboard on copy", async () => {
    const writeText = stubClipboard();
    render(<AgentsPromptCard app={app} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy AGENTS.md" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const [copied] = writeText.mock.calls[0];
    expect(copied).toContain(`# ${app.name} — agent instructions`);
    expect(copied).toContain(app.slug);
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copy AGENTS.md" }),
      ).toHaveTextContent("Copied"),
    );
  });

  it("renders gracefully when stack and URL resolve to nothing", () => {
    render(<AgentsPromptCard app={bareApp} />);
    expect(
      screen.getByRole("heading", { name: "Agent instructions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`# ${bareApp.name} — agent instructions`, {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/none assigned yet/)).toBeInTheDocument();
    expect(screen.getByText(/not assigned yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy AGENTS.md" }),
    ).toBeInTheDocument();
  });
});
