import { fireEvent, render, screen } from "@testing-library/react";
import { expect, vi } from "vitest";
import { ProfileMenu } from "@/components/profile-menu";

const USER = {
  email: "ada@example.com",
  name: "Ada Lovelace",
  role: "admin" as const,
};

const SETTINGS_LINKS = [
  "/settings/general",
  "/settings/nodes",
  "/settings/dns",
  "/settings/stacks",
  "/settings/auth",
  "/settings/users",
  "/settings/email",
];

describe("ProfileMenu", () => {
  it("is closed by default", () => {
    render(<ProfileMenu user={USER} onLogout={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Open profile menu" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens on trigger click and shows the user header", () => {
    render(<ProfileMenu user={USER} onLogout={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
    expect(screen.getByRole("menu", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("expands the Settings submenu showing all seven links", () => {
    render(<ProfileMenu user={USER} onLogout={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
    expect(
      screen.queryByRole("menu", { name: "Settings" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const submenu = screen.getByRole("menu", { name: "Settings" });
    expect(submenu).toBeInTheDocument();
    for (const href of SETTINGS_LINKS) {
      const link = submenu.querySelector(`a[href="${href}"]`);
      expect(link).not.toBeNull();
    }
    expect(submenu.querySelectorAll("a")).toHaveLength(7);
  });

  it("calls onLogout when the Log out button is clicked", () => {
    const onLogout = vi.fn();
    render(<ProfileMenu user={USER} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("renders a Sign in link to /login when user is null", () => {
    render(<ProfileMenu user={null} onLogout={() => {}} />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
    expect(
      screen.queryByRole("button", { name: "Open profile menu" }),
    ).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<ProfileMenu user={USER} onLogout={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
    expect(screen.getByRole("menu", { name: "Profile" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
