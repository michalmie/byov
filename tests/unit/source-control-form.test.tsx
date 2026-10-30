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
  return (
    <SourceControlForm
      draft={draft}
      errors={{}}
      onProvider={(value) => {
        const next = { ...draft, provider: value };
        setDraft(next);
        onDraft?.(next);
      }}
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

  it("has one editable pattern field, prefilled with byov-{app-slug}", () => {
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
    expect(screen.queryByLabelText("Prefix")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Suffix/)).not.toBeInTheDocument();
    const pattern = screen.getByLabelText("Repo name pattern");
    expect(pattern).toHaveValue("byov-{app-slug}");
    fireEvent.change(pattern, { target: { value: "apps-{app-slug}" } });
    expect(screen.getByText("acme-labs/apps-rota-planner")).toBeInTheDocument();
  });

  it("offers GitHub as the default provider with future providers disabled", () => {
    render(<Harness initial={defaultSourceControlSettings()} />);
    const provider = document.querySelector<HTMLInputElement>(
      'input[name="sc-provider"]:not(:disabled)',
    );
    expect(provider?.value).toBe("github");
    expect(provider).toBeChecked();
    const future = document.querySelectorAll<HTMLInputElement>(
      'input[name="sc-provider"]:disabled',
    );
    expect(future.length).toBe(3);
  });

  it("keeps private selected by default and personal/org choices visible", () => {
    render(<Harness initial={defaultSourceControlSettings()} />);
    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="sc-account-type"][value="user"]',
      ),
    ).not.toBeChecked();
    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="sc-account-type"][value="organization"]',
      ),
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
