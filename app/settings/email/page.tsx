"use client";

import { useEffect, useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { SettingsSubnav } from "@/components/settings-subnav";
import { MailSettingsForm, type MailStatus } from "@/components/mail-settings-form";

type RoleState = "loading" | "admin" | "member" | "signed-out";

async function readSessionRole(): Promise<RoleState> {
  try {
    const response = await fetch("/api/auth/session");
    if (!response.ok) return "signed-out";
    const body: unknown = await response.json();
    const role =
      typeof body === "object" && body !== null
        ? (body as { user?: { role?: unknown } }).user?.role
        : undefined;
    if (role === "admin") return "admin";
    if (role === "member") return "member";
    return "signed-out";
  } catch {
    return "signed-out";
  }
}

async function readMailStatus(): Promise<MailStatus | null> {
  try {
    const response = await fetch("/api/settings/mail");
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const status =
      typeof body === "object" && body !== null
        ? (body as { status?: unknown }).status
        : undefined;
    return isMailStatus(status) ? status : null;
  } catch {
    return null;
  }
}

function isMailStatus(value: unknown): value is MailStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.configured === "boolean" &&
    typeof status.source === "string" &&
    typeof status.host === "string" &&
    typeof status.port === "number" &&
    typeof status.security === "string" &&
    typeof status.user === "string" &&
    typeof status.from === "string" &&
    typeof status.hasPassword === "boolean"
  );
}

export default function SettingsEmail() {
  const [role, setRole] = useState<RoleState>("loading");
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [nextRole, nextStatus] = await Promise.all([
        readSessionRole(),
        readMailStatus(),
      ]);
      if (cancelled) return;
      setRole(nextRole);
      if (nextRole === "admin") {
        if (nextStatus) {
          setStatus(nextStatus);
        } else {
          setFailed(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleStatusChange(next: MailStatus) {
    setStatus(next);
    setRevision((value) => value + 1);
  }

  return (
    <ControlPlaneShell crumb="Settings / Email" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Email</h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            The default account BYOV uses to send notifications —
            sign-in codes and links today, workspace notifications next.
            Saved on the server; without it, mail only lands in the
            server log.
          </p>
        </div>

        {role === "loading" && (
          <div
            data-testid="email-loading"
            aria-busy="true"
            aria-label="Loading email settings"
            className="card grid animate-pulse gap-3 p-5 sm:p-6"
          >
            <div
              className="h-10 rounded-[6px]"
              style={{ background: "var(--color-paper-2)" }}
            />
            <div
              className="h-10 rounded-[6px]"
              style={{ background: "var(--color-paper-2)" }}
            />
          </div>
        )}

        {role === "member" && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="warn" label="Admins only" />
            <span style={{ color: "var(--color-ink-2)" }}>
              Only workspace admins can see or change the sending account.
            </span>
          </p>
        )}

        {role === "signed-out" && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="warn" label="Signed out" />
            <span style={{ color: "var(--color-ink-2)" }}>
              Sign in to manage the sending account.
            </span>
          </p>
        )}

        {role === "admin" && failed && (
          <p role="alert" data-testid="email-load-error" className="form-error">
            Could not load the sending account. Please try again.
          </p>
        )}

        {role === "admin" && status && (
          <MailSettingsForm
            key={revision}
            initial={status}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>
    </ControlPlaneShell>
  );
}
