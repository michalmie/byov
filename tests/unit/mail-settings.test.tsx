import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  MailSettingsForm,
  type MailStatus,
} from "@/components/mail-settings-form";

const UNCONFIGURED: MailStatus = {
  configured: false,
  source: "none",
  host: "",
  port: 587,
  security: "auto",
  user: "",
  from: "",
  hasPassword: false,
};

const SAVED: MailStatus = {
  configured: true,
  source: "settings",
  host: "smtp.example.com",
  port: 587,
  security: "auto",
  user: "alerts@example.com",
  from: "BYOV <alerts@example.com>",
  hasPassword: true,
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MailSettingsForm", () => {
  it("shows the not-configured state and saves the account", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe("/api/settings/mail");
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        host: "smtp.example.com",
        port: 587,
        user: "alerts@example.com",
      });
      return jsonResponse({ ok: true, status: SAVED });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onStatusChange = vi.fn();
    render(<MailSettingsForm initial={UNCONFIGURED} onStatusChange={onStatusChange} />);

    expect(screen.getByText("Not configured")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("mail-host"), {
      target: { value: "smtp.example.com" },
    });
    fireEvent.change(screen.getByTestId("mail-user"), {
      target: { value: "alerts@example.com" },
    });
    fireEvent.change(screen.getByTestId("mail-pass"), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByTestId("mail-save"));

    expect(await screen.findByTestId("mail-banner")).toHaveTextContent(
      "Sending account saved.",
    );
    expect(onStatusChange).toHaveBeenCalledWith(SAVED);
  });

  it("shows field errors from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ ok: false, errors: { host: "Enter the SMTP host." } }, false, 400),
      ),
    );
    render(
      <MailSettingsForm initial={UNCONFIGURED} onStatusChange={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("mail-save"));
    expect(await screen.findByText("Enter the SMTP host.")).toBeInTheDocument();
  });

  it("sends a test email and reports the result", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe("/api/settings/mail/test");
      expect(JSON.parse(String(init?.body))).toEqual({
        to: "ada@example.com",
      });
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MailSettingsForm initial={SAVED} onStatusChange={() => {}} />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("mail-test-to"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByTestId("mail-test-send"));

    expect(await screen.findByTestId("mail-test-result")).toHaveTextContent(
      "Test email sent to ada@example.com.",
    );
  });

  it("surfaces test delivery failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ ok: false, error: "connect ECONNREFUSED" }, false, 502),
      ),
    );
    render(<MailSettingsForm initial={SAVED} onStatusChange={() => {}} />);
    fireEvent.change(screen.getByTestId("mail-test-to"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByTestId("mail-test-send"));

    expect(await screen.findByTestId("mail-test-result")).toHaveTextContent(
      "connect ECONNREFUSED",
    );
  });

  it("clears the saved account after confirm", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe("/api/settings/mail");
      expect(init?.method).toBe("DELETE");
      return jsonResponse({
        ok: true,
        status: { ...UNCONFIGURED, from: "BYOV <no-reply@byov.local>" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onStatusChange = vi.fn();
    render(<MailSettingsForm initial={SAVED} onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByTestId("mail-reset"));
    fireEvent.click(screen.getByTestId("mail-reset-confirm"));

    expect(await screen.findByTestId("mail-banner")).toHaveTextContent(
      "server env applies",
    );
    expect(onStatusChange).toHaveBeenCalled();
  });
});
