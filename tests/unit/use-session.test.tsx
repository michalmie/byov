import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import { useSession } from "@/lib/use-session";

const USER: AuthUser = {
  email: "ada@example.com",
  name: "Ada",
  provider: "passwordless",
  role: "admin",
};

function mockFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }));
}

const locationDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "location",
);

afterEach(() => {
  vi.unstubAllGlobals();
  if (locationDescriptor) {
    Object.defineProperty(window, "location", locationDescriptor);
  }
});

function mockAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: { assign },
    writable: true,
    configurable: true,
  });
  return assign;
}

function Harness() {
  const { user, loading, logout } = useSession();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <button type="button" onClick={() => void logout()}>
        log out
      </button>
    </div>
  );
}

describe("useSession", () => {
  it("starts loading, then sets the user from the session", async () => {
    const fetchMock = mockFetch({ user: USER });
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(await screen.findByText(USER.email)).toBeInTheDocument();
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session");
  });

  it("sets the user to null when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("sets the user to null on a non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetch({ user: null }, false));
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("logout sends DELETE then redirects to /login", async () => {
    const assign = mockAssign();
    const fetchMock = mockFetch({ user: USER });
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    expect(await screen.findByText(USER.email)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "log out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
      method: "DELETE",
    });
  });

  it("logout redirects to /login even when the request fails", async () => {
    const assign = mockAssign();
    // First call (mount) succeeds, second (logout) fails.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: USER }),
      })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    expect(await screen.findByText(USER.email)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "log out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
  });
});
