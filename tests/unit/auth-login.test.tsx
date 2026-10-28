import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { getSafeNext, LoginView } from "@/app/login/login-view";

const ALL_PROVIDERS = [
  { id: "passwordless", label: "Passwordless code", enabled: true },
  { id: "magic-link", label: "Email sign-in link", enabled: true },
  { id: "entra", label: "Microsoft Entra ID", enabled: true },
  { id: "github", label: "GitHub", enabled: true },
  { id: "google", label: "Google", enabled: true },
  { id: "apple", label: "Apple", enabled: true },
];

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response;
}

type RouteHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;

/** Install a fetch mock routing by URL; unmatched routes 404. */
function mockFetch(handler: RouteHandler, providers = ALL_PROVIDERS) {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/auth/providers")) {
      return jsonResponse(providers);
    }
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Providers payload with only the given email method(s) switched on. */
function emailOnlyProviders(...on: string[]) {
  return ALL_PROVIDERS.map((provider) =>
    provider.id === "passwordless" || provider.id === "magic-link"
      ? { ...provider, enabled: on.includes(provider.id) }
      : { ...provider, enabled: false },
  );
}

let assignSpy: ReturnType<typeof vi.fn>;

// jsdom's location.assign is a non-configurable stub that throws, so the whole
// window.location object is swapped for a fake carrying the spy.
const locationDescriptor = Object.getOwnPropertyDescriptor(window, "location");

beforeEach(() => {
  assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      href: "http://localhost:3000/",
      origin: "http://localhost:3000",
      protocol: "http:",
      host: "localhost:3000",
      hostname: "localhost",
      port: "3000",
      pathname: "/",
      search: "",
      hash: "",
      assign: assignSpy,
      replace: vi.fn(),
      reload: vi.fn(),
      toString: () => "http://localhost:3000/",
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (locationDescriptor) {
    Object.defineProperty(window, "location", locationDescriptor);
  }
});

function signInWithCode() {
  fireEvent.change(screen.getByTestId("login-email"), {
    target: { value: "ada@byov.example" },
  });
  fireEvent.click(screen.getByTestId("request-code"));
}

describe("LoginView static content", () => {
  it("renders a standalone card with heading, tagline and footer", async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    render(<LoginView />);
    expect(
      screen.getByRole("heading", { name: "Sign in to BYOV" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Secure access to your control plane."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Access restricted to approved members."),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();
  });

  it("shows a loading skeleton while providers load", async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    render(<LoginView />);
    expect(screen.getByTestId("providers-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();
    expect(screen.queryByTestId("providers-loading")).not.toBeInTheDocument();
  });
});

describe("passwordless code flow", () => {
  it("requests a code, verifies it and navigates to next", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      if (url.includes("/api/auth/otp/verify")) {
        return jsonResponse({ ok: true, user: { email: "ada@byov.example" } });
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView nextParam="/apps/shopfloor" />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-code")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/otp/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "ada@byov.example",
          next: "/apps/shopfloor",
        }),
      }),
    );
    // One request sends a single email carrying both artifacts.
    expect(await screen.findByTestId("login-success")).toHaveTextContent(
      "We emailed a 6-digit code and a sign-in link",
    );

    const codeInput = screen.getByTestId("login-code");
    expect(codeInput).toHaveAttribute("inputmode", "numeric");
    expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("verify-code"));

    // Navigation waits for the "Verified" chip morph (~950ms).
    await waitFor(
      () => expect(assignSpy).toHaveBeenCalledWith("/apps/shopfloor"),
      { timeout: 3000 },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/otp/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "ada@byov.example", code: "123456" }),
      }),
    );
  });

  it("verifies automatically once the sixth digit lands", async () => {
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      if (url.includes("/api/auth/otp/verify")) {
        return jsonResponse({ ok: true, user: { email: "ada@byov.example" } });
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView nextParam="/apps" />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-code")).toBeInTheDocument();
    // No click on Verify: completing the boxes submits on its own.
    fireEvent.change(screen.getByTestId("login-code"), {
      target: { value: "123456" },
    });

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/apps"), {
      timeout: 3000,
    });
  });

  it("morphs into a Verified chip before navigating", async () => {
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      if (url.includes("/api/auth/otp/verify")) {
        return jsonResponse({ ok: true, user: { email: "ada@byov.example" } });
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-code")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("login-code"), {
      target: { value: "123456" },
    });

    // The chip and the polite live region share the label; pin the chip.
    expect(
      await screen.findByText("Verified", { selector: ".otp-pill-text" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/"), {
      timeout: 3000,
    });
  });

  it("clears the boxes after a failed verification", async () => {
    vi.useFakeTimers();
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      if (url.includes("/api/auth/otp/verify")) {
        return jsonResponse({ ok: false, error: "Invalid or expired code." }, false, 401);
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView />);
    await act(async () => {});
    expect(screen.getByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    await act(async () => {});
    fireEvent.change(screen.getByTestId("login-code"), {
      target: { value: "000000" },
    });
    // Flush the auto-verify round trip without advancing the clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("login-error")).toHaveTextContent(
      "Invalid or expired code.",
    );

    // Past the shake-and-fade window the boxes empty for the next try.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.queryByTestId("login-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-code")).toHaveValue("");
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("shows the server error when verification fails", async () => {
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      if (url.includes("/api/auth/otp/verify")) {
        return jsonResponse({ ok: false, error: "Invalid or expired code." }, false, 401);
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-code")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("login-code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByTestId("verify-code"));

    expect(await screen.findByTestId("login-error")).toHaveTextContent(
      "Invalid or expired code.",
    );
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("rejects codes that are not 6 digits without calling the API", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-code")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("login-code"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByTestId("verify-code"));

    expect(await screen.findByTestId("login-error")).toHaveTextContent(
      "Enter the 6-digit code from your email.",
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/auth/otp/verify"),
      ),
    ).toBe(false);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("shows an error when the code request fails", async () => {
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) {
        return jsonResponse({ error: "Too many requests." }, false, 429);
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-error")).toHaveTextContent(
      "Too many requests.",
    );
    expect(screen.queryByTestId("login-code")).not.toBeInTheDocument();
  });

  it("rejects a blank email without calling the API", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("request-code"));
    expect(await screen.findByTestId("login-error")).toHaveTextContent(
      "Enter a valid email address.",
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/auth/otp/request"),
      ),
    ).toBe(false);
  });

  it("disables the request button while sending", async () => {
    let resolveRequest!: (value: Response) => void;
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) {
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        });
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(screen.getByTestId("request-code")).toBeDisabled();
    expect(screen.getByTestId("request-code")).toHaveTextContent("Sending");

    await act(async () => {
      resolveRequest(jsonResponse({ ok: true }));
    });
    expect(await screen.findByTestId("login-code")).toBeInTheDocument();
  });

  it("cools down resend for 30s after a code is sent", async () => {
    vi.useFakeTimers();
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView />);
    await act(async () => {});
    expect(screen.getByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    await act(async () => {});
    // While cooling down the resend row shows a countdown, not a button.
    // The clock lives in its own span for a stable width; the separator is
    // a non-breaking space.
    const waitText = () =>
      document.querySelector(".otp-wait")?.textContent ?? null;
    expect(waitText()).toBe("Resend in\u00a00:30");
    expect(screen.queryByTestId("resend-code")).not.toBeInTheDocument();

    // Advance one second per act() so the rescheduling effect flushes
    // between ticks.
    for (let remaining = 29; remaining >= 1; remaining--) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(waitText()).toBe(
        `Resend in\u00a00:${String(remaining).padStart(2, "0")}`,
      );
      expect(screen.queryByTestId("resend-code")).not.toBeInTheDocument();
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(document.querySelector(".otp-wait")).not.toBeInTheDocument();
    expect(screen.getByTestId("resend-code")).toBeEnabled();
    expect(screen.getByTestId("resend-code")).toHaveTextContent("Resend code");
  });
});

describe("magic-link flow", () => {
  it("shows the inbox success state after requesting a link", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("/api/auth/magic-link/request")) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ ok: false }, false, 404);
    }, emailOnlyProviders("magic-link"));
    render(<LoginView />);
    expect(await screen.findByTestId("magic-link-request")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("login-email"), {
      target: { value: "ada@byov.example" },
    });
    fireEvent.click(screen.getByTestId("magic-link-request"));

    expect(await screen.findByTestId("login-success")).toHaveTextContent(
      "Check your inbox",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/magic-link/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "ada@byov.example" }),
      }),
    );
  });

  it("forwards a non-default next target with the link request", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("/api/auth/magic-link/request")) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ ok: false }, false, 404);
    }, emailOnlyProviders("magic-link"));
    render(<LoginView nextParam="/apps/shopfloor-tickets" />);
    expect(await screen.findByTestId("magic-link-request")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("login-email"), {
      target: { value: "ada@byov.example" },
    });
    fireEvent.click(screen.getByTestId("magic-link-request"));

    expect(await screen.findByTestId("login-success")).toHaveTextContent(
      "Check your inbox",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/magic-link/request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "ada@byov.example",
          next: "/apps/shopfloor-tickets",
        }),
      }),
    );
  });

  it("disables the magic-link button while sending", async () => {
    let resolveRequest!: (value: Response) => void;
    mockFetch((url) => {
      if (url.includes("/api/auth/magic-link/request")) {
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        });
      }
      return jsonResponse({ ok: false }, false, 404);
    }, emailOnlyProviders("magic-link"));
    render(<LoginView />);
    expect(await screen.findByTestId("magic-link-request")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("login-email"), {
      target: { value: "ada@byov.example" },
    });
    fireEvent.click(screen.getByTestId("magic-link-request"));
    expect(screen.getByTestId("magic-link-request")).toBeDisabled();

    await act(async () => {
      resolveRequest(jsonResponse({ ok: true }));
    });
    expect(await screen.findByTestId("login-success")).toBeInTheDocument();
  });
});

describe("single email flow", () => {
  it("shows one request with both methods on (no separate link button)", async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();
    expect(
      screen.queryByTestId("magic-link-request"),
    ).not.toBeInTheDocument();
  });

  it("shows only the code form when the link method is off", async () => {
    mockFetch(
      () => jsonResponse({ ok: true }),
      emailOnlyProviders("passwordless"),
    );
    render(<LoginView />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();
    expect(
      screen.queryByTestId("magic-link-request"),
    ).not.toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-success")).toHaveTextContent(
      "We emailed a 6-digit code to ada@byov.example.",
    );
  });

  it("shows only the link request when codes are off", async () => {
    mockFetch(
      () => jsonResponse({ ok: true }),
      emailOnlyProviders("magic-link"),
    );
    render(<LoginView />);
    expect(
      await screen.findByTestId("magic-link-request"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("request-code")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-code")).not.toBeInTheDocument();
  });
});

describe("OAuth links", () => {
  it("links each enabled provider with the encoded next target", async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    render(<LoginView nextParam="/apps/lab?tab=checks" />);
    const authorize = (id: string) =>
      `/api/auth/oauth/${id}/authorize?next=${encodeURIComponent("/apps/lab?tab=checks")}`;

    for (const id of ["entra", "github", "google", "apple"]) {
      expect(await screen.findByTestId(`oauth-${id}`)).toHaveAttribute(
        "href",
        authorize(id),
      );
    }
    expect(screen.getByTestId("oauth-github").tagName).toBe("A");
  });

  it("hides disabled providers but keeps the rest", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        ALL_PROVIDERS.map((provider) =>
          provider.id === "github" ? { ...provider, enabled: false } : provider,
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginView />);
    expect(await screen.findByTestId("oauth-google")).toBeInTheDocument();
    expect(screen.queryByTestId("oauth-github")).not.toBeInTheDocument();
  });

  it("hides email methods the API disables", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        ALL_PROVIDERS.map((provider) =>
          provider.id === "passwordless" || provider.id === "magic-link"
            ? { ...provider, enabled: false }
            : provider,
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginView />);
    expect(await screen.findByTestId("oauth-github")).toBeInTheDocument();
    expect(screen.queryByTestId("request-code")).not.toBeInTheDocument();
    expect(screen.queryByTestId("magic-link-request")).not.toBeInTheDocument();
  });
});

describe("?error= copy", () => {
  it.each([
    ["not-allowed", "Your email is not on the access list."],
    ["oauth-failed", "Sign-in failed, please try again."],
  ])("maps ?error=%s to friendly copy", async (error, copy) => {
    mockFetch(() => jsonResponse({ ok: true }));
    render(<LoginView errorParam={error} />);
    expect(await screen.findByTestId("login-error")).toHaveTextContent(copy);
  });

  it("ignores unknown error values", async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    render(<LoginView errorParam="bogus" />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();
    expect(screen.queryByTestId("login-error")).not.toBeInTheDocument();
  });
});

describe("providers failure fallback", () => {
  it("shows all methods with a warning when providers fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        if (String(input).includes("/api/auth/providers")) {
          throw new Error("network down");
        }
        return jsonResponse({ ok: true });
      }),
    );
    render(<LoginView />);
    expect(await screen.findByTestId("providers-warning")).toHaveTextContent(
      "Could not load sign-in options",
    );
    // Fallback enables everything, so the single code-first flow shows.
    expect(screen.getByTestId("request-code")).toBeInTheDocument();
    expect(
      screen.queryByTestId("magic-link-request"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("oauth-github")).toBeInTheDocument();
    expect(screen.getByTestId("oauth-entra")).toBeInTheDocument();
  });

  it("falls back when the payload has the wrong shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ nope: true })));
    render(<LoginView />);
    expect(await screen.findByTestId("providers-warning")).toBeInTheDocument();
    expect(screen.getByTestId("request-code")).toBeInTheDocument();
  });
});

describe("getSafeNext", () => {
  it.each([
    ["/apps/lab", "/apps/lab"],
    ["/", "/"],
    ["/a?b=c&d=e", "/a?b=c&d=e"],
    [undefined, "/"],
    ["", "/"],
    ["https://evil.example/phish", "/"],
    ["//evil.example/phish", "/"],
    ["apps/lab", "/"],
  ])("maps %s to %s", (input, expected) => {
    expect(getSafeNext(input)).toBe(expected);
  });

  it("navigates to / after verify when next is absolute", async () => {
    mockFetch((url) => {
      if (url.includes("/api/auth/otp/request")) return jsonResponse({ ok: true });
      if (url.includes("/api/auth/otp/verify")) {
        return jsonResponse({ ok: true, user: { email: "ada@byov.example" } });
      }
      return jsonResponse({ ok: false }, false, 404);
    });
    render(<LoginView nextParam="https://evil.example/phish" />);
    expect(await screen.findByTestId("request-code")).toBeInTheDocument();

    signInWithCode();
    expect(await screen.findByTestId("login-code")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("login-code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByTestId("verify-code"));

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/"), {
      timeout: 3000,
    });
  });
});
