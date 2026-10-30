import { fireEvent, render, screen } from "@testing-library/react";
import { AppForm, type AppOwnerOption } from "@/components/app-form";
import type { AppDraft, AppFieldErrors } from "@/lib/apps";
import { listNodes } from "@/lib/control-plane";
import type { SourceControlSettings } from "@/lib/source-control";
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

  it("defaults the owner to the signed-in creator and submits it", () => {
    const seen: AppDraft[] = [];
    render(
      <AppForm
        formId="new-app"
        initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
        stacks={stacks}
        nodes={nodes}
        preferredNode=""
        currentUserEmail="ada@example.com"
        submitLabel="Create app"
        onSubmit={(draft) => {
          seen.push(draft);
          return null;
        }}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText("App owner")).toHaveValue("ada@example.com");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.change(screen.getByLabelText("Owner GitHub username"), {
      target: { value: "ada-dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen[0]?.owner).toBe("ada@example.com");
    expect(seen[0]?.ownerGithub).toBe("ada-dev");
  });

  it("assigns a workspace member as owner from the picker", () => {
    const owners: AppOwnerOption[] = [
      { email: "ada@example.com", name: "Ada Lovelace" },
      { email: "sam@example.com", name: "Sam Tan" },
    ];
    const seen: AppDraft[] = [];
    render(
      <AppForm
        formId="new-app"
        initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
        stacks={stacks}
        nodes={nodes}
        preferredNode=""
        owners={owners}
        currentUserEmail="ada@example.com"
        submitLabel="Create app"
        onSubmit={(draft) => {
          seen.push(draft);
          return null;
        }}
        onCancel={() => {}}
      />,
    );
    const picker = screen.getByLabelText("App owner");
    expect(picker.tagName).toBe("SELECT");
    expect(picker).toHaveValue("ada@example.com");
    fireEvent.change(picker, { target: { value: "sam@example.com" } });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen[0]?.owner).toBe("sam@example.com");
  });

  it("lets the creator clear the owner back to Unassigned", () => {
    const seen: AppDraft[] = [];
    render(
      <AppForm
        formId="new-app"
        initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
        stacks={stacks}
        nodes={nodes}
        preferredNode=""
        owners={[{ email: "ada@example.com" }]}
        currentUserEmail="ada@example.com"
        submitLabel="Create app"
        onSubmit={(draft) => {
          seen.push(draft);
          return null;
        }}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("App owner"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen[0]?.owner).toBe("");
  });

  it("previews the owner as repo contributor when a repo will be created", () => {
    const sourceControl: SourceControlSettings = {
      provider: "github",
      repoPattern: "byov-{app-slug}",
      connected: true,
      accountType: "organization",
      accountLogin: "acme-labs",
      installationId: "12345678",
      defaultVisibility: "private",
      allowPublicRepos: false,
      repoPrefix: "byov-",
      repoSuffix: "",
      defaultBranch: "main",
      autoCreateRepo: true,
      topics: "byov",
    };
    render(
      <AppForm
        formId="new-app"
        initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
        stacks={stacks}
        nodes={nodes}
        preferredNode=""
        sourceControl={sourceControl}
        currentUserEmail="ada@example.com"
        submitLabel="Create app"
        onSubmit={() => null}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    expect(
      screen.getByText(/Add the owner's GitHub username above/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Owner GitHub username"), {
      target: { value: "ada-dev" },
    });
    expect(
      screen.getByText(/will be added as a contributor \(push\)/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("acme-labs/byov-rota-planner").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("defaults access to Workspace and submits a restricted CIDR rule", () => {
    const seen: AppDraft[] = [];
    renderForm(undefined, (draft) => {
      seen.push(draft);
      return null;
    });
    expect(screen.getByRole("radio", { name: /Workspace/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Restricted/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Rule 1 value"), {
      target: { value: "203.0.113.0/24" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen[0]?.accessPolicy?.scope).toBe("restricted");
    expect(seen[0]?.accessPolicy?.rules[0]).toMatchObject({
      effect: "allow",
      type: "cidr",
      value: "203.0.113.0/24",
    });
  });

  it("submits Public only when explicitly chosen", () => {
    const seen: AppDraft[] = [];
    renderForm(undefined, (draft) => {
      seen.push(draft);
      return null;
    });
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen[0]?.accessPolicy?.scope).toBe("public");
  });

  it("clears the stack when Bring my own code is chosen", () => {
    const seen: string[] = [];
    renderForm("ai-chatbot", (draft) => {
      seen.push(draft.stack);
      return null;
    });
    fireEvent.click(
      screen.getByRole("radio", { name: /Bring my own code/ }),
    );
    expect(screen.getByLabelText("Tech stack")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen).toEqual([""]);
  });

  it("previews the app in the summary rail as the name is typed", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    expect(screen.getByText(/apps list/)).toBeInTheDocument();
    expect(screen.getAllByText("rota-planner").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Rota Planner")).toBeInTheDocument();
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
