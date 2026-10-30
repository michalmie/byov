import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { SourceControlForm } from "@/components/source-control-form";
import { AppForm } from "@/components/app-form";
import {
  defaultSourceControlSettings,
  type SourceControlSettings,
} from "@/lib/source-control";
import { listNodes } from "@/lib/control-plane";
import { listStacks } from "@/lib/stacks";

function Harness({
  initial,
  onDraft,
}: {
  initial: SourceControlSettings;
  onDraft?: (draft: SourceControlSettings) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [previewSlug, setPreviewSlug] = useState("rota-planner");
  return (
    <SourceControlForm
      draft={draft}
      errors={{}}
      previewSlug={previewSlug}
      onPreviewSlugChange={setPreviewSlug}
      onToggle={(field, value) => {
        const next = { ...draft, [field]: value };
        setDraft(next);
        onDraft?.(next);
      }}
      onAccountType={(value) => {
        const next = { ...draft, accountType: value };
        setDraft(next);
        onDraft?.(next);
      }}
      onVisibility={(value) => {
        const next = { ...draft, defaultVisibility: value };
        setDraft(next);
        onDraft?.(next);
      }}
      onText={(field, value) => {
        const next = { ...draft, [field]: value };
        setDraft(next);
        onDraft?.(next);
      }}
    />
  );
}

describe("SourceControlForm", () => {
  it("previews the byov- taxonomy for the sample slug", () => {
    render(<Harness initial={defaultSourceControlSettings()} />);
    expect(screen.getByText("byov-rota-planner")).toBeInTheDocument();
    expect(screen.getByText(/Visibility:/)).toHaveTextContent("private");
  });

  it("updates the preview from prefix, owner and preview slug", () => {
    render(
      <Harness
        initial={{
          ...defaultSourceControlSettings(),
          connected: true,
          accountLogin: "acme-labs",
        }}
      />,
    );
    expect(screen.getByText("acme-labs/byov-rota-planner")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Prefix"), {
      target: { value: "apps-" },
    });
    expect(screen.getByText("acme-labs/apps-rota-planner")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Preview with app slug"), {
      target: { value: "leave-balancer" },
    });
    expect(screen.getByText("acme-labs/apps-leave-balancer")).toBeInTheDocument();
  });

  it("keeps private selected by default and personal/org choices visible", () => {
    render(<Harness initial={defaultSourceControlSettings()} />);
    expect(
      screen.getByRole("radio", { name: /Personal account/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Organization/ }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: /privateOnly/i })).toBeChecked();
  });
});

describe("AppForm source-control preview", () => {
  const stacks = listStacks();
  const nodes = listNodes();

  it("previews and submits the governed repo when linked", () => {
    const seen: Array<{ repoUrl?: string; branch?: string }> = [];
    render(
      <AppForm
        formId="new-app"
        initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
        stacks={stacks}
        nodes={nodes}
        preferredNode=""
        sourceControl={{
          ...defaultSourceControlSettings(),
          connected: true,
          accountLogin: "acme-labs",
          accountType: "organization",
        }}
        submitLabel="Create app"
        onSubmit={(draft) => {
          seen.push({ repoUrl: draft.repoUrl, branch: draft.branch });
          return null;
        }}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    expect(
      screen.getByText("acme-labs/byov-rota-planner"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen).toEqual([
      { repoUrl: "https://github.com/acme-labs/byov-rota-planner", branch: "main" },
    ]);
  });

  it("shows a link prompt and submits no repo while unlinked", () => {
    const seen: Array<{ repoUrl?: string }> = [];
    render(
      <AppForm
        formId="new-app"
        initial={{ name: "", slug: "", description: "", stack: "", node: "" }}
        stacks={stacks}
        nodes={nodes}
        preferredNode=""
        sourceControl={defaultSourceControlSettings()}
        submitLabel="Create app"
        onSubmit={(draft) => {
          seen.push({ repoUrl: draft.repoUrl });
          return null;
        }}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByText(/No GitHub account linked yet/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rota Planner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(seen[0].repoUrl).toBeUndefined();
  });
});
