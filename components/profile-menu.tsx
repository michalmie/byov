"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BellIcon,
  ChevronDownIcon,
  DocIcon,
  GearIcon,
  GlobeIcon,
  GridIcon,
  LayersIcon,
  ShieldCheckIcon,
  StackIcon,
} from "./icons";

export interface ProfileMenuUser {
  email: string;
  name: string | null;
  role: "admin" | "member";
}

const settingsSections = [
  { href: "/settings/general", label: "General", icon: DocIcon },
  { href: "/settings/nodes", label: "Nodes", icon: StackIcon },
  { href: "/settings/dns", label: "DNS", icon: GlobeIcon },
  { href: "/settings/stacks", label: "Tech stacks", icon: LayersIcon },
  { href: "/settings/auth", label: "Auth", icon: ShieldCheckIcon },
  { href: "/settings/users", label: "Users", icon: GridIcon },
  { href: "/settings/email", label: "Email", icon: BellIcon },
];

function initialFor(user: ProfileMenuUser): string {
  const source = user.name?.trim() || user.email.trim();
  return source ? source[0]!.toUpperCase() : "?";
}

function roleLabel(role: ProfileMenuUser["role"]): string {
  return role === "admin" ? "Admin" : "Member";
}

export function ProfileMenu({
  user,
  onLogout,
}: {
  user: ProfileMenuUser | null;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  if (!user) {
    return (
      <Link href="/login" className="btn-ghost px-2.5 py-1.5 text-[13px]">
        Sign in
      </Link>
    );
  }

  const displayName = user.name?.trim() || user.email;

  const closeMenu = () => {
    setMenuOpen(false);
    setSettingsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="Open profile menu"
        className="icon-btn h-8 w-8 shrink-0"
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-semibold"
          style={{
            background: "var(--color-paper-2)",
            border: "1px solid var(--color-rule)",
            color: "var(--color-ink)",
          }}
        >
          {initialFor(user)}
        </span>
      </button>
      {menuOpen && (
        <div
          role="menu"
          aria-label="Profile"
          className="menu absolute right-0 top-full z-[var(--z-dropdown)] mt-1.5 grid w-64 gap-0.5 p-1.5"
        >
          <div className="min-w-0 px-2 py-1.5">
            <p className="truncate text-[13px] font-semibold">
              {displayName}
            </p>
            {user.name?.trim() && (
              <p
                className="truncate text-[12px]"
                style={{ color: "var(--color-muted)" }}
              >
                {user.email}
              </p>
            )}
            <p
              className="mt-0.5 text-[12px] capitalize"
              style={{ color: "var(--color-muted)" }}
            >
              {roleLabel(user.role)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            aria-expanded={settingsOpen}
            aria-haspopup="menu"
            className="menu-link w-full px-2 py-1.5 text-left text-[13px]"
          >
            <GearIcon className="h-4 w-4 shrink-0" />
            <span className="flex-1">Settings</span>
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
          </button>
          {settingsOpen && (
            <div role="menu" aria-label="Settings" className="grid gap-0.5">
              {settingsSections.map((section) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={section.href}
                    role="menuitem"
                    href={section.href}
                    onClick={closeMenu}
                    className="menu-link px-2 py-1.5 pl-8 text-[13px]"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {section.label}
                  </Link>
                );
              })}
            </div>
          )}
          <div
            className="mx-2 my-1 border-t"
            style={{ borderColor: "var(--color-rule)" }}
          />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onLogout();
            }}
            className="menu-link w-full px-2 py-1.5 text-left text-[13px]"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
