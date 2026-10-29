import { fireEvent, render, screen } from "@testing-library/react";
import { AppForm } from "@/components/app-form";
import type { AppDraft, AppFieldErrors } from "@/lib/apps";
import { listNodes } from "@/lib/control-plane";
import { listStacks } from "@/lib/stacks";

const stacks = listStacks();
const nodes = listNodes();

function renderForm(
  preferredStack?: string,
  onSubmit: (draft: AppDraft) => AppFieldErrors | null = () => null,
  omitHeading = false,
) {
  return render(
    <AppForm
      formId="new-app"
      heading={omitHeading ? undefined : "Create app"}
      lede={omitHeading ? undefined : "Pick a stack."}
      initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
      stacks={stacks}
      nodes={nodes}
      preferredNode=""
      preferredStack={preferredStack}
      submitLabel="Create app"
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
}

describe("AppForm stack prefill", () => {
  it("prefills a known stack slug", () => {
    renderForm("ai-chatbot");
    expect(screen.getByLabelText("Tech stack")).toHaveValue("ai-chatbot");
  });

  it("ignores an unknown prefill slug", () => {
    renderForm("no-such-stack");
    expect(screen.getByLabelText("Tech stack")).toHaveValue("");
  });

  it("starts with no stack without a prefill", () => {
    renderForm();
    expect(screen.getByLabelText("Tech stack")).toHaveValue("");
  });

  it("lets the user clear a prefill back to no stack", () => {
    const seen: string[] = [];
    renderForm("ai-chatbot", (draft) => {
      seen.push(draft.stack);
      return null;
    });
    fireEvent.change(screen.getByLabelText("Tech stack"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen).toEqual([""]);
  });

  it("omits the card heading when none is given", () => {
    renderForm(undefined, () => null, true);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "New app form" }),
    ).toBeInTheDocument();
  });

  it("previews the name-based slug in the placeholder", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    expect(screen.getByLabelText("Slug")).toHaveAttribute(
      "placeholder",
      "rota-planner",
    );
  });

  it("submits an explicit slug override", () => {
    const seen: string[] = [];
    renderForm(undefined, (draft) => {
      seen.push(draft.slug);
      return null;
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "rota-eu" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen).toEqual(["rota-eu"]);
  });

  it("renders description as a multiline textarea", () => {
    renderForm();
    const description = screen.getByLabelText("Description");
    expect(description.tagName).toBe("TEXTAREA");
    expect(description).toHaveAttribute("rows", "4");
  });

  it("submits the prefilled stack with an explicit choice winning", () => {
    const seen: string[] = [];
    renderForm("ai-chatbot", (draft) => {
      seen.push(draft.stack);
      return null;
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Shifts." },
    });
    fireEvent.change(screen.getByLabelText("Tech stack"), {
      target: { value: stacks[2].slug },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen).toEqual([stacks[2].slug]);
  });
});
