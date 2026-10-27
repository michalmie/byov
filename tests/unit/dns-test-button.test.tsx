import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import { DnsTestButton } from "@/components/dns-test-button";

const RESULT = {
  host: "byov-probe.qa-lab-01.byov.xexo.io",
  port: 443,
  dns: { ok: true, addresses: ["203.0.113.10"] },
  tls: {
    ok: true,
    authorized: true,
    cert: { subject: "CN=*.qa-lab-01.byov.xexo.io" },
  },
  http: { ok: true, status: 404 },
};

function mockFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DnsTestButton", () => {
  it("posts the target and renders each stage", async () => {
    const fetchMock = mockFetch(RESULT);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DnsTestButton
        host="byov-probe.qa-lab-01.byov.xexo.io"
        note="Any HTTP status counts."
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dns-test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          host: "byov-probe.qa-lab-01.byov.xexo.io",
          port: 443,
        }),
      }),
    );
    expect(await screen.findByText("203.0.113.10")).toBeInTheDocument();
    expect(
      screen.getByText("CN=*.qa-lab-01.byov.xexo.io"),
    ).toBeInTheDocument();
    expect(screen.getByText("status 404")).toBeInTheDocument();
    expect(screen.getByText("Any HTTP status counts.")).toBeInTheDocument();
  });

  it("shows request errors", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Expected a testable hostname." }, false));
    render(<DnsTestButton host="localhost" />);
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(
      await screen.findByText("Expected a testable hostname."),
    ).toBeInTheDocument();
  });
});
