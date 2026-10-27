import { render, screen } from "@testing-library/react";
import { ActivityFeed } from "@/components/activity-feed";
import { AppSubnav } from "@/components/app-subnav";
import { EnvironmentCard } from "@/components/environment-card";
import { filterApps } from "@/components/sidebar";
import { appSections, listApps } from "@/lib/control-plane";

function renderSubnav() {
  return render(
    <AppSubnav
      name="Leave Balancer"
      slug="leave-balancer"
      stack="Next.js App"
      health="degraded"
      sections={appSections}
    />,
  );
}

describe("AppSubnav", () => {
  it("renders the app and every section anchor", () => {
    renderSubnav();
    expect(screen.getByText("Leave Balancer")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Environments" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "#environments");
    }
  });

  it("marks overview active by default", () => {
    renderSubnav();
    const current = screen.getAllByRole("link", { name: "Overview" });
    expect(current.length).toBeGreaterThan(0);
    for (const link of current) {
      expect(link).toHaveAttribute("aria-current", "true");
    }
  });
});

describe("EnvironmentCard", () => {
  it("renders environment facts", () => {
    render(
      <EnvironmentCard
        env={{
          name: "production",
          node: "coolify-frankfurt",
          status: "healthy",
          url: "https://leave.apps.byov.internal",
        }}
        nodeName="frankfurt-01"
        lastDeploy={{
          id: "dpl_7z2t8",
          env: "production",
          status: "live",
          when: "48 min ago",
          by: "Elena Ruiz",
        }}
        checksPassing={4}
        checksTotal={5}
      />,
    );
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(
      screen.getByText("https://leave.apps.byov.internal"),
    ).toBeInTheDocument();
    expect(screen.getByText("frankfurt-01")).toBeInTheDocument();
    expect(screen.getByText("dpl_7z2t8")).toBeInTheDocument();
    expect(screen.getByText("4/5 passing")).toBeInTheDocument();
  });

  it("shows a dash without deployments", () => {
    render(
      <EnvironmentCard
        env={{
          name: "staging",
          node: "coolify-qa-lab",
          status: "deploying",
          url: "https://lab-staging.apps.byov.internal",
        }}
        nodeName="qa-lab-01"
        lastDeploy={undefined}
        checksPassing={4}
        checksTotal={5}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("filterApps", () => {
  it("returns everything on a blank query", () => {
    expect(filterApps(listApps(), "   ")).toHaveLength(listApps().length);
  });

  it("matches names case-insensitively", () => {
    const matches = filterApps(listApps(), "leave");
    expect(matches.map((app) => app.slug)).toEqual(["leave-balancer"]);
  });

  it("returns nothing when no name matches", () => {
    expect(filterApps(listApps(), "no-such-app")).toHaveLength(0);
  });
});

describe("ActivityFeed", () => {
  it("renders actors with their events", () => {
    render(
      <ActivityFeed
        items={[
          {
            when: "4 min ago",
            actor: "Maya Okonkwo",
            text: "started a staging deploy of Lab Inventory",
          },
        ]}
      />,
    );
    expect(screen.getByText("Maya Okonkwo")).toBeInTheDocument();
    expect(
      screen.getByText("started a staging deploy of Lab Inventory"),
    ).toBeInTheDocument();
  });
});
