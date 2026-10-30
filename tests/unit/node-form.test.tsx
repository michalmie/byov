import { fireEvent, render, screen } from "@testing-library/react";
import { expect, vi } from "vitest";
import { NodeForm } from "@/components/node-form";
import type { NodeDraft } from "@/lib/settings";

const COOLIFY_DRAFT: NodeDraft = {
  name: "",
  kind: "Coolify",
  location: "",
  endpoint: "",
  domainZone: "",
  tailnetHost: "",
};

function renderForm(initial: NodeDraft = COOLIFY_DRAFT) {
  const onSubmit = vi.fn(() => null);
  const onCancel = vi.fn();
  render(
    <NodeForm
      formId="test-node"
      heading="Add node"
      lede="Register a deployment target."
      initial={initial}
      submitLabel="Add node"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

describe("NodeForm", () => {
  it("puts the node type picker first", () => {
    renderForm();
    const typePicker = screen.getByLabelText("Type");
    const nameField = screen.getByLabelText("Name");
    expect(
      typePicker.compareDocumentPosition(nameField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const legends = Array.from(document.querySelectorAll("legend")).map(
      (legend) => legend.textContent,
    );
    expect(legends[0]).toBe("Node type");
  });

  it("shows Coolify instructions for a Coolify draft", () => {
    renderForm();
    expect(
      screen.getByText("Coolify setup checklist"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Vercel setup checklist"),
    ).not.toBeInTheDocument();
  });

  it("swaps to Vercel instructions when the kind changes", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "Vercel" },
    });
    expect(
      screen.getByText("Vercel setup checklist"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Coolify setup checklist"),
    ).not.toBeInTheDocument();
  });

  it("falls back to Coolify instructions for unknown kinds", () => {
    renderForm({ ...COOLIFY_DRAFT, kind: "Kubernetes" });
    expect(
      screen.getByText("Coolify setup checklist"),
    ).toBeInTheDocument();
  });

  it("submits the draft and surfaces returned errors", () => {
    const onSubmit = vi.fn(() => ({ name: "Give the node a name." }));
    render(
      <NodeForm
        formId="test-node"
        heading="Add node"
        lede="Register a deployment target."
        initial={{ ...COOLIFY_DRAFT, location: "Frankfurt" }}
        submitLabel="Add node"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "Coolify", location: "Frankfurt" }),
    );
    expect(screen.getByText("Give the node a name.")).toBeInTheDocument();
  });
});
